// Compares Claude models on real meal photos, to choose MEAL_PHOTO_MODEL. Runs the meal-photo function's own code
// (its prompts, unchanged) once per model, then the app's own matching (search.ts) against moh.json, and reports per
// model: foods found, calories, time and cost. Not part of the app; the user's own foods aren't here, only moh.json.
//
//   DENO_NO_PACKAGE_JSON=1 ANTHROPIC_API_KEY=… deno run -A --no-check --node-modules-dir=none scripts/compare-models.ts <cases.json> [runs=2] [models=haiku,sonnet,opus]
//
// cases.json, photo paths relative to it:
//   [{ "name": "קרמבולה", "photos": ["star.jpg"], "note": "", "expect": ["קרמבולה"], "kcal": [20, 60], "answers": [] }]
// expect: a pattern each food the review list must end up with; kcal: the total's range; answers: what to tap for
// the questions asked, in order (none: unanswered). Photos are shrunk as the app does (1024 px JPEG), with ImageMagick.
import { dirname, resolve } from 'node:path';
import { matchFoods, matchMealWith, splitAnd, unitFor, type Picked, type Seen } from '../src/search.ts';
import type { Food } from '../src/db.ts';

const MODELS: Record<string, { id: string; usdPerMTok: [number, number] }> = {
  haiku: { id: 'claude-haiku-5-5', usdPerMTok: [0.1, 0.5] },
  sonnet: { id: 'claude-sonnet-5-5', usdPerMTok: [2, 10] },
  opus: { id: 'claude-opus-5-5', usdPerMTok: [4, 20] },
};
type Case = { name: string; photos?: string[]; note?: string; expect: string[]; kcal: [number, number]; answers?: string[] };

const [casesPath, runsArg = '2', modelsArg = Object.keys(MODELS).join(',')] = Deno.args;
if (!casesPath || !Deno.env.get('ANTHROPIC_API_KEY')) throw new Error('usage: ANTHROPIC_API_KEY=… deno run -A --no-check scripts/compare-models.ts <cases.json> [runs] [models]');
const cases: Case[] = JSON.parse(await Deno.readTextFile(casesPath));
const moh: Food[] = JSON.parse(await Deno.readTextFile(new URL('../public/foods/moh.json', import.meta.url)));

async function shrink(path: string) {
  const out = await new Deno.Command('convert', { args: [path, '-auto-orient', '-resize', '1024x1024>', '-quality', '80', 'jpg:-'] }).output();
  if (!out.success) throw new Error(`convert failed: ${path}`);
  let s = ''; for (const b of out.stdout) s += String.fromCharCode(b);
  return btoa(s);
}

// Tokens used, read off the API's replies as they pass through fetch.
const used = { in: 0, out: 0 };
const fetch0 = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const res = await fetch0(input, init);
  if (String(input instanceof Request ? input.url : input).includes('/v1/messages')) {
    res.clone().json().then((j) => { used.in += j.usage?.input_tokens ?? 0; used.out += j.usage?.output_tokens ?? 0; }, () => {});
  }
  return res;
};

// The function's handler, loaded once per model: Deno.serve is caught instead of started, and MODEL is read at load.
let handler: (r: Request) => Promise<Response>;
Object.defineProperty(Deno, 'serve', { value: (h: typeof handler) => { handler = h; }, configurable: true });
async function functionFor(model: string) {
  Deno.env.set('MEAL_PHOTO_MODEL', model);
  await import(`../supabase/functions/meal-photo/index.ts?model=${model}`);
  const h = handler;
  return async (body: unknown) => (await h(new Request('http://local', { method: 'POST', body: JSON.stringify(body) }))).json();
}

// The review list's rows as the app makes them (Review.tsx: splitAnd, then the AI's pick or the search's first).
function rowsOf(parsed: Awaited<ReturnType<typeof matchMealWith>>) {
  return splitAnd(moh, parsed, []).map((p) => {
    const food = moh.find((f) => f.id === p.foodId) ?? matchFoods(moh, p.query, [])[0];
    if (!food) return { said: p.text, name: null, grams: 0, kcal: 0 };
    const a = unitFor(food, p);
    const grams = a.qty * a.unit.g;
    return { said: p.text, name: food.name, grams: Math.round(grams), kcal: Math.round((food.kcal * grams) / food.servingG) };
  });
}

const runs = Number(runsArg);
const lines: string[] = [];
const summary: string[] = ['| Model | Passed | Avg time | Cost per photo |', '|---|---|---|---|'];
for (const key of modelsArg.split(',')) {
  const m = MODELS[key];
  if (!m) throw new Error(`unknown model ${key}`);
  const call = await functionFor(m.id);
  const ask = async (b: { note: string; items: unknown[] }) => { const d = await call({ mode: 'pick', ...b }); if (!d.items) throw new Error(d.error); return d.items as Picked[]; };
  let passed = 0, secs = 0, usd = 0;
  for (const c of cases) {
    const images = await Promise.all((c.photos ?? []).map((p) => shrink(resolve(dirname(casesPath), p))));
    for (let r = 1; r <= runs; r++) {
      used.in = used.out = 0;
      const t0 = performance.now();
      const seen: Seen & { error?: string } = await call({ images, note: c.note ?? '' });
      const rows = seen.items ? rowsOf(await matchMealWith(ask, moh, [], seen, c.note ?? '', c.answers ?? [])) : [];
      const s = (performance.now() - t0) / 1000;
      await new Promise((ok) => setTimeout(ok, 50)); // the last usage read settles
      const cost = (used.in * m.usdPerMTok[0] + used.out * m.usdPerMTok[1]) / 1e6;
      const total = rows.reduce((t, x) => t + x.kcal, 0);
      const ok = !seen.error && c.expect.every((e) => rows.some((x) => x.name && new RegExp(e).test(x.name))) && total >= c.kcal[0] && total <= c.kcal[1];
      passed += +ok; secs += s; usd += cost;
      lines.push(`### ${c.name} · ${key} · run ${r}: ${ok ? 'PASS' : 'FAIL'} (${total} kcal, expected ${c.kcal.join('–')}; ${s.toFixed(1)} s; $${cost.toFixed(4)})`,
        seen.error ? `- error: ${seen.error}` : '',
        ...rows.map((x) => `- ${x.said} → ${x.name ?? '(no match)'}, ${x.grams} g, ${x.kcal} kcal`),
        ...(seen.questions ?? []).map((q) => `- asked: ${q.text} (${q.options.join(' / ')})`), '');
    }
  }
  const n = cases.length * runs;
  summary.push(`| ${m.id} | ${passed}/${n} | ${(secs / n).toFixed(1)} s | $${(usd / n).toFixed(4)} |`);
}
const report = ['# Model comparison', '', ...summary, '', ...lines.filter((l, i, a) => l || a[i - 1])].join('\n');
await Deno.writeTextFile(resolve(dirname(casesPath), 'results.md'), report);
console.log(summary.join('\n'));

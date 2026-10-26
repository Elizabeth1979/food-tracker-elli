// Names the foods in a meal photo (or a meal described in words, with no photo), with rough amounts, for the app's
// review list, and asks the user up to 3 questions where the answer changes the calories a lot (which dish a name means,
// how much oil a typed salad had).
// Then, with `mode: 'pick'`, it picks each item's database food from the closest ones the app found, or breaks a dish
// the database lacks into ingredients. Calories always come from the app's database, never from the model.
// With `mode: 'label'` it instead reads a printed nutrition table (טבלת ערכים תזונתיים) into per-100 g values
// for the new-food form, which the user checks before saving; a supplement's table comes back per tablet, with
// its vitamins and minerals in `extra` under the names the app sends (`names`).
// Needs the ANTHROPIC_API_KEY secret; only signed-in users can call it (verify_jwt).
import Anthropic from 'npm:@anthropic-ai/sdk@0.129.0';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0.129.0/helpers/zod';
import { z } from 'npm:zod@4.6.5';

const MODEL = Deno.env.get('MEAL_PHOTO_MODEL') ?? 'claude-haiku-5-5';
const MAX_PHOTOS = 4; // the app's limit too (MAX_PHOTOS in src/lib.ts)
// The unit words the app's parser and food database understand.
const UNITS = ['גרם', 'כף', 'כפית', 'כוס', 'ספל', 'יחידה', 'פרוסה', 'גביע', 'מנה', 'חופן', 'עלה'] as const;

const Meal = z.object({
  items: z.array(z.object({
    name: z.string().describe('Short generic Hebrew food name, e.g. "ענבים", "יוגורט 3%", "חמאת בוטנים"'),
    qty: z.number().describe('How many of `unit`'),
    unit: z.enum(UNITS),
    grams: z.number().describe('Your estimate of the total weight in grams of this item as served, e.g. 4 lettuce leaves ≈ 40'),
    hidden: z.boolean().describe('true for a fat or sauce you infer from how the food looks cooked or dressed but cannot clearly see'),
    about: z.string().describe('A few Hebrew words on what kind it is and how it was made, from the photo, the note and what such a dish usually is: "סמיך ושמנתי, מתוק, בסגנון מסעדת סושי", "ביתי", "מטוגן בשמן עמוק"'),
  })),
  questions: z.array(z.object({
    item: z.number().describe('Index of the item in `items` the question is about'),
    text: z.string().describe('Short Hebrew question, e.g. "המרק היה סמיך ושמנתי או צלול?"'),
    options: z.array(z.string()).describe('2 to 4 short Hebrew answers to tap'),
  })).describe('At most 3; none when the photo and note make it clear'),
});
const Item = z.object({ name: z.string(), qty: z.number(), unit: z.enum(UNITS), grams: z.number() });
const Picks = z.object({
  items: z.array(z.object({
    id: z.string().nullable().describe('The chosen candidate\'s id, or null when no candidate is this food'),
    qty: z.number(), unit: z.enum(UNITS), grams: z.number(),
    parts: z.array(Item).describe('Only when id is null: the dish\'s ingredients; otherwise empty'),
  })),
});

const SYSTEM = `You look at a photo of a meal and list the foods in it for a Hebrew food diary.
- There may be several photos of the same meal (other angles, another dish, the drink): list each food once across all of them, never twice because two photos show it.
- One item per food, Hebrew names as they appear in the Israeli Ministry of Health food database (צמרת): generic and short ("ענבים", "גבינה לבנה 5%", "לחם מלא"), no brands unless the packaging shows one. Mashed potato is "פירה".
- Each food once: a potato that is cut, peeled or partly squashed is still one item, not "boiled" plus "mashed".
- Estimate each amount in the most natural unit: pieces (יחידה) for countable foods, spoons (כף/כפית) for spreads and toppings, cups or a גביע for yogurt, grams when nothing else fits. A יחידה is one whole item (a whole head of lettuce, a whole potato): count lettuce or cabbage leaves in עלה, and use grams for slices or chunks of something.
- Count only what you can see; never assume more is hidden. Judge size against the plate (a dinner plate is about 26 cm): small potatoes weigh about 50 g, not 180. When unsure, guess the smaller amount.
- Also give each item's total weight in grams (\`grams\`); the app checks the unit against it.
- Fat is what photos miss most. When food looks sautéed, roasted or fried in a pan, a salad looks dressed, bread looks buttered, or there is sauce, add the fat as its own item with \`hidden\` true, in spoons, under a plain name ("שמן זית", "שמן קנולה", "חמאה", "טחינה", "מיונז"). A food you name as fried ("שניצל מטוגן", "צ׳יפס") already counts its frying oil: don't add oil for it. Every other item has \`hidden\` false.
- The user's note is more reliable than the photo: when it names a food or an amount, use it, and add foods it mentions that the photo hides.
- With no photo, the note alone describes the meal: list its foods the same way. Nothing shows how it was dressed, so when a food is usually eaten with a fat, sauce or sugar the note doesn't mention (oil or dressing on a salad, tahini in a pita, butter on bread, sugar in coffee or tea), add it as its own item with \`hidden\` true in its usual amount and ask how much (the question's \`item\` is that added item), e.g. "שמן או רוטב על הסלט?" with "בלי", "כפית", "כף". Not for a food named as fried.
- When the user says they made the dish (הכנתי, ביתי) and says what went into it, list each ingredient as its own item, in the amounts said or usual for such a dish.
- The note is often dictated by voice: read a misheard or misspelled word as the food it most likely is in this meal (in a salad, a word that sounds like "מלפפון" is cucumber, not a pastry), and spoken amounts as amounts ("שתי כפות של עגבנייה" is 2 כף of עגבניה). Each food it names is one item, in the amount it says.
- Ask a question only where neither the photo nor the note tells and the answer changes the item's calories by a quarter or more: creamy or clear soup, fried or grilled, with or without sauce, sugar or not, the size when nothing in the photo shows scale. Not for small differences.
- A name that means clearly different dishes in Israel gets a question whose options are those dishes, unless the photo or the note settles it: "סלט עוף" is a deli salad with mayonnaise ("סלט עוף עם מיונז") or a green salad with chicken pieces ("סלט ירוק עם עוף"); "קפה עם חלב" is instant coffee ("נס קפה") or espresso with steamed milk ("הפוך"). Write \`about\` from what you know already; answers come later.
- If the photo shows no food, return an empty list.`;

const PICK_SYSTEM = `You match each food of a meal to an entry of a Hebrew food database (the Israeli Ministry of Health's, and the user's own foods), for a food diary.
For each item you get what was seen (name, \`about\`, amount), the user's answers to questions about it, and candidate database entries with their kcal per 100 g. The user's note covers the whole meal.
- Choose the candidate that is this food, made this way: home-cooked or from an instant powder, restaurant style, creamy or clear, fried or grilled, sweetened or not. Its kcal per 100 g should be plausible for what was described. An entry that is a different kind of the same food is not a match.
- When no candidate is this food (a restaurant or foreign dish the database lacks, or only another kind is listed), set id to null and break the dish into its main ingredients in \`parts\`: plain, generic Hebrew names as such a database lists them ("תירס", "שמנת מתוקה 32%", "סוכר", "חמאה", "ציר עוף", "אטריות"), each with an amount, together weighing what the whole dish does. Include the fat, sugar and cream a restaurant would typically use.
- Keep the amount, or correct it where an answer tells you better (a size, "two cups"). Same units as the item. When an answer says the item wasn't there ("בלי", "לא"), set qty 0.
- An answer that names the kind of dish ("סלט ירוק עם עוף") decides it: choose that kind, or break that kind into its ingredients.
- Return exactly one entry per item, in the same order.`;

// The label is transcribed as printed; turning per-serving values into per-100 g is done below, not by the model.
const num = (d: string) => z.number().describe(d);
const opt = (d: string) => z.number().nullable().describe(`${d}, or null when the label doesn't list it`);
const Label = z.object({
  isLabel: z.boolean().describe('false when the photo is not a nutrition facts table'),
  name: z.string().describe('Product name in Hebrew as printed on the package, or "" when not visible'),
  per: z.enum(['100g', 'serving']).describe('Which column the values below come from: "100g" (also per 100 ml) whenever the label has it'),
  servingG: z.number().nullable().describe('Grams (or ml) in one serving, when the label states it'),
  servingIsPiece: z.boolean().describe('true when the label says one serving is a single countable piece, e.g. "מנה = 1 מסטיק", "1 חטיף", "1 יחידה", "1 טבליה", "1 כמוסה"; false for a bag, a cup, grams only, or several pieces'),
  pieceWord: z.enum(['יחידה', 'טבליה', 'כמוסה']).describe('What one piece is: a tablet (טבליה), a capsule or softgel (כמוסה), otherwise יחידה'),
  extra: z.array(z.object({
    name: z.string().describe('One of the listed names, exactly; otherwise the Hebrew name with its unit in parentheses, e.g. "קואנזים Q10 (מ״ג)"'),
    amount: z.number().describe('The amount in the unit of `name`, converted when the label prints another unit'),
  })).describe('Every vitamin, mineral and other active ingredient on the label besides the fields above'),
  kcal: num('Energy in kcal (קלוריות), not kJ'),
  carbs: num('Total carbohydrates (פחמימות) in g, not just the sugars line'),
  fat: num('Total fat (שומנים) in g'),
  protein: num('Protein (חלבונים) in g'),
  sodium: opt('Sodium (נתרן) in mg; if only salt in g is printed, salt × 400'),
  calcium: opt('Calcium (סידן) in mg'),
  potassium: opt('Potassium (אשלגן) in mg'),
  b12: opt('Vitamin B12 in micrograms (מק״ג)'),
});

const LABEL_SYSTEM = `You read the nutrition facts table (טבלת ערכים תזונתיים) on an Israeli food package or dietary supplement (תוסף תזונה, "Supplement Facts"), for a Hebrew food diary.
- Copy the numbers exactly as printed. Prefer the "ל-100 גרם" / "ל-100 מ״ל" column; use the per-serving column ("למנה", "לטבליה", "לכמוסה") only when there is no per-100 column. A supplement usually has only that column.
- A value printed as "פחות מ-0.5" or "<0.5" counts as 0. A supplement with no energy line has 0 kcal and 0 macros.
- List in \`extra\` every other vitamin, mineral and active ingredient (omega-3, coenzyme Q10…), not sugars, fats or fibre. Name each one exactly as in this list when it is there, converting to its unit (vitamin D: 40 IU = 1 µg; vitamin A: 1 IU = 0.3 µg; vitamin E: 1 IU = 0.67 mg; mg = 1000 µg): {NAMES}
- If the photo isn't a nutrition table, or it is too blurry to read it, set isLabel to false.`;

async function readLabel(image: string, names: string[]) {
  const res = await new Anthropic().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low', format: zodOutputFormat(Label) },
    system: LABEL_SYSTEM.replace('{NAMES}', names.join(', ')),
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } }] }],
  });
  const l = res.parsed_output;
  if (res.stop_reason === 'refusal' || !l || !l.isLabel) return reply({ error: 'לא מצאתי בתמונה טבלת ערכים תזונתיים. נסו לצלם אותה מקרוב, ישר ובאור טוב.' });
  const servingG = l.servingG && l.servingG > 0 ? l.servingG : null;
  // A supplement's tablet seldom has a printed weight: its values stay per piece, with the piece as 1 g.
  const perPiece = l.per === 'serving' && !servingG && l.kcal === 0;
  if (l.per === 'serving' && !servingG && !perPiece) return reply({ error: 'בטבלה יש ערכים למנה בלבד, בלי משקל המנה. אפשר למלא את הערכים ידנית ולכתוב את משקל המנה.' });
  const f = l.per === 'serving' && !perPiece ? 100 / servingG! : 1;
  const at = (x: number | null, dp = 1) => (x == null ? null : Math.round(x * f * 10 ** dp) / 10 ** dp);
  const extra = Object.fromEntries(l.extra.filter((x) => x.name.trim() && x.amount > 0).map((x) => [x.name.trim(), at(x.amount, 2)]));
  return reply({
    label: {
      name: l.name.trim(),
      kcal: at(l.kcal, 0), carbs: at(l.carbs), fat: at(l.fat), protein: at(l.protein),
      sodium: at(l.sodium, 0), calcium: at(l.calcium, 0), potassium: at(l.potassium, 0), b12: at(l.b12, 2),
      extra: Object.keys(extra).length ? extra : null,
      // "יחידה" (or טבליה/כמוסה) only when the label's serving is one piece (a gum, a bar, a tablet); otherwise "מנה",
      // since a serving is often the whole bag and calling that "יחידה" would take the name a single piece needs.
      unit: perPiece ? { n: l.pieceWord, g: 1 } : servingG ? { n: l.servingIsPiece ? l.pieceWord : 'מנה', g: servingG } : null,
      perServing: l.per === 'serving',
      basisG: perPiece ? 1 : 100, // the grams the values are for
    },
  });
}

// Picks each item's database food from the candidates the app sent (see PICK_SYSTEM). Text only, so it's quick and cheap.
async function pick(note: string, items: unknown) {
  if (!Array.isArray(items) || !items.length || items.length > 20) return reply({ error: 'בקשה לא תקינה' }, 400);
  const str = (x: unknown, n: number) => (typeof x === 'string' ? x.slice(0, n) : '');
  const list = items.map((i, k) => {
    const c = Array.isArray(i?.candidates) ? i.candidates.slice(0, 12) : [];
    const answers = Array.isArray(i?.answers) ? i.answers.slice(0, 3).map((a: unknown) => str(a, 200)) : [];
    return [`${k}. ${str(i?.name, 100)}: ${Number(i?.qty) || 1} ${str(i?.unit, 20)} (${Number(i?.grams) || '?'} ג׳)${i?.about ? `, ${str(i.about, 200)}` : ''}`,
      ...answers.map((a: string) => `   תשובה: ${a}`),
      ...c.map((f: { id?: unknown; name?: unknown; kcal?: unknown }) => `   - id ${str(f?.id, 80)}: ${str(f?.name, 150)} (${Number(f?.kcal) || 0} קק״ל ל־100 ג׳)`),
    ].join('\n');
  });
  const res = await new Anthropic().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low', format: zodOutputFormat(Picks) },
    system: PICK_SYSTEM,
    messages: [{ role: 'user', content: `${note.trim() ? `הערה: ${note.trim().slice(0, 500)}` : 'אין הערה.'}\n\n${list.join('\n\n')}` }],
  });
  if (res.stop_reason === 'refusal' || !res.parsed_output || res.parsed_output.items.length !== items.length) return reply({ error: 'ההתאמה נכשלה' });
  return reply({ items: res.parsed_output.items.map((p) => ({ ...p, parts: p.parts.filter((x) => x.name.trim() && x.qty > 0) })) });
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return reply({ error: 'זיהוי תמונות עוד לא הוגדר (חסר מפתח API בשרת).' });
  let image: unknown, images: unknown, note: unknown, mode: string, names: unknown, items: unknown;
  try {
    ({ image, images, note = '', mode = 'meal', names = [], items = [] } = await req.json());
  } catch {
    return reply({ error: 'בקשה לא תקינה' }, 400);
  }
  if (typeof note !== 'string') return reply({ error: 'בקשה לא תקינה' }, 400);
  // A meal can come as several photos (`images`, up to MAX_PHOTOS), or as words alone (none); a label is one (`image`).
  const shots = Array.isArray(images) ? images : image == null ? [] : [image];
  if (mode !== 'pick') {
    if (shots.length > MAX_PHOTOS || shots.some((s) => typeof s !== 'string' || !s || s.length > 3_000_000)) return reply({ error: 'התמונה גדולה מדי' }, 400);
    if (!shots.length && (mode === 'label' || !note.trim())) return reply({ error: 'התמונה חסרה' }, 400);
  }
  // The app's vitamin names (VITAMINS in src/lib.ts), so a nutrient is named the same on every label.
  const vitaminNames = Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string' && n.length <= 40).slice(0, 60) : [];

  try {
    if (mode === 'pick') return await pick(note, items);
    if (mode === 'label') return await readLabel(shots[0] as string, vitaminNames);
    const res = await new Anthropic().messages.parse({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low', format: zodOutputFormat(Meal) },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          ...shots.map((data) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: data as string } })),
          { type: 'text', text: note.trim() ? `${shots.length ? 'הערה' : 'בלי תמונה. מה שאכלתי'}: ${note.trim().slice(0, 500)}` : 'אין הערה.' },
        ],
      }],
    });
    if (res.stop_reason === 'refusal' || !res.parsed_output) return reply({ error: 'לא הצלחתי לזהות מזונות. אפשר לכתוב את הארוחה במקום.' });
    const keep = res.parsed_output.items.map((i) => !!i.name.trim() && i.qty > 0);
    const found = res.parsed_output.items.filter((_, k) => keep[k]);
    // a question points at its item by index, which dropping empty items shifts
    const questions = res.parsed_output.questions
      .filter((q) => keep[q.item] && q.text.trim() && q.options.length >= 2)
      .slice(0, 3).map((q) => ({ ...q, item: keep.slice(0, q.item).filter(Boolean).length, options: q.options.slice(0, 4) }));
    return reply({ items: found, questions });
  } catch (e) {
    console.error(e);
    const status = e instanceof Anthropic.APIError ? e.status : undefined;
    return reply({ error: status === 401 ? 'מפתח ה־API בשרת לא תקין.' : status === 429 ? 'יותר מדי בקשות, נסו שוב בעוד רגע.' : mode === 'label' ? 'קריאת הטבלה נכשלה. נסו שוב או מלאו את הערכים ידנית.' : 'זיהוי התמונה נכשל. נסו שוב או כתבו את הארוחה.' });
  }
});

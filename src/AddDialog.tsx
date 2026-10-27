import { useEffect, useId, useMemo, useState } from 'react';
import type { Ctx } from './App';
import { GRAMS, MEALS, isDish, loadMoh, isWater, mealNow, placeOf, head, addDays, addEntries, addUnit, json, MAX_PHOTOS, amountLabel, client, fmtDate, itemFor, loadEntries, mealItems, parseLine, matchMeal, pickItem, readLabel, readMeal, savePhoto, scale, searchFoods, sum, today, unitsOf, type Entry, type Food, type Item, type MealKey, type MealPhoto, type Nut, type Parsed, type Question, type SavedMeal, type Seen, type Unit } from './lib';
import { norm, repeatOf, unitGuesser } from './search';
import { goalsLeft, whatFits, type Goals } from './goals';
import { AiTag, FileButton, FoodHit, MINE_HINT, Modal, PhotoPick, confirmIt, Reading, UNIT_HINT, UnitInputs, Why, unitOf, usePhotoUrl, type UnitDraft } from './ui';
import { FoodForm, labelFood, saveFood } from './Foods';
import { ReviewList } from './Review';
import { Icon } from './icons';

// Calories and macros only: vitamins are for looking closer (a food's details, the day's summary), not for adding.
export const NutLine = ({ n, kcal = true }: { n: Nut; kcal?: boolean }) => (
  <div className="nutline">{kcal && <b>{n.kcal} קק״ל</b>}<span>פחמימות {n.carbs} ג׳</span><span>שומן {n.fat} ג׳</span><span>חלבון {n.protein} ג׳</span></div>
);

const PREFERRED = ['יחידה בינונית', 'יחידה', 'פרוסה', 'פרוסה בינונית', 'מנה בינונית'];

// Rescale from an item's own snapshot so it works even if the food was edited or removed.
export const itemFood = (foods: Food[], it: Item) => {
  const f = foods.find((x) => x.id === it.foodId);
  return { ...(f ?? {}), id: it.foodId, name: it.name, servingG: it.grams, units: f?.units ?? null, ...scale(it, 1) } as Food;
};
// An item's amount as the amount picker takes it: pieces as counted, grams as grams.
export const itemInit = (it: Item) => (it.unit && it.unit !== GRAMS ? { qty: it.qty ?? 1, unit: it.unit } : { qty: it.grams, unit: GRAMS });

// qty + unit picker for a food; returns an Item. With onAddUnit, the unit list ends in "＋ יחידה חדשה".
// `named`: the food's name heads it, with the calories for the amount on the same line (where the window
// isn't already titled with the name).
export function Amount({ food, init, onPick, cta, onAddUnit, named }: { food: Food; init?: { qty: number; unit: string }; onPick: (it: Item) => void; cta: string; onAddUnit?: (u: Unit) => Promise<unknown>; named?: boolean }) {
  const [extra, setExtra] = useState<Unit[]>([]);
  const units = [...unitsOf(food), ...extra.filter((u) => !unitsOf(food).some((x) => x.n === u.n))];
  const [unit, setUnit] = useState(() => units.find((u) => u.n === init?.unit)
    ?? (food.source === 'moh' ? PREFERRED.map((n) => units.find((u) => u.n === n)).find(Boolean) : units[1]) ?? units[0]);
  const [qty, setQty] = useState(String(init?.qty ?? (unit.g === 1 ? food.servingG : 1)));
  const [adding, setAdding] = useState(false);
  const it = itemFor(food, Number(qty) || 0, unit);
  const why = useId();
  const saveUnit = async (u: Unit) => {
    await onAddUnit!(u);
    setExtra([...extra, u]); setUnit(u); setQty('1'); setAdding(false);
  };
  return (
    <div className="amount">
      {named && <header><h3>{food.name}</h3><b>{it.kcal} קק״ל</b></header>}
      <div className="amount-row">
        <input type="number" inputMode="decimal" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus onFocus={(e) => e.target.select()} />
        <select value={adding ? '+' : unit.n} onChange={(e) => {
          if (e.target.value === '+') return setAdding(true);
          const u = units.find((x) => x.n === e.target.value)!; setUnit(u); setQty(u.g === 1 ? String(food.servingG) : '1');
        }}>
          <UnitOptions units={units} canAdd={!!onAddUnit} />
        </select>
      </div>
      {adding && <NewUnit food={food} onSave={saveUnit} onCancel={() => setAdding(false)} />}
      <NutLine n={it} kcal={!named} />
      <button className="btn primary" disabled={!it.grams} aria-describedby={it.grams ? undefined : why} onClick={() => onPick(it)}>{cta}</button>
      {!it.grams && <Why id={why}>כתבו כמות גדולה מאפס כדי להוסיף</Why>}
    </div>
  );
}

// A food's units for a <select>; `canAdd` ends the list in "＋ יחידה חדשה…" (value "+").
export const UnitOptions = ({ units, canAdd }: { units: Unit[]; canAdd?: boolean }) => <>
  {units.map((u) => <option key={u.n} value={u.n}>{u.g === 1 ? u.n : `${u.n} (${u.g} ג׳)`}</option>)}
  {canAdd && <option value="+">＋ יחידה חדשה…</option>}
</>;

// Typing a size the food doesn't list ("יחידה גדולה" = 250 ג׳); saved on the food, so it's there next time.
// Few people know what a spoon of something weighs, so a known size's grams are filled from a similar
// database food (see unitGuesser) until typed by hand.
export function NewUnit({ food, onSave, onCancel }: { food: Food; onSave: (u: Unit) => Promise<unknown>; onCancel: () => void }) {
  const [d, setD] = useState<UnitDraft>({ k: '1', n: '', g: '' });
  const [typed, setTyped] = useState(false);
  const [moh, setMoh] = useState<Food[]>([]);
  useEffect(() => { void loadMoh().then(setMoh); }, []);
  const guessOf = useMemo(() => (moh.length ? unitGuesser(moh, food) : null), [moh, food]);
  const guess = typed ? null : guessOf?.(d.n) ?? null;
  const g = guess ? String(Math.round(guess.g * (Number(d.k) || 1) * 100) / 100) : '';
  useEffect(() => { if (!typed) setD((x) => ({ ...x, g })); }, [g, typed]);
  const save = () => { const u = unitOf(d); if (u.n && u.g > 0) void onSave(u); };
  return (
    <div className="unit-row">
      <p className="muted small">{UNIT_HINT}</p>
      <UnitInputs d={d} set={(x) => { if (x.g !== d.g) setTyped(true); setD(x); }} autoFocus />
      <button className="btn small primary" onClick={save}>שמור</button>
      <button className="icon" aria-label="ביטול" onClick={onCancel}><Icon name="x" /></button>
      <p className="muted small" role="status">{guess && (guess.from
        ? `לפי ״${guess.from}״: ${d.n.trim()} = ${guess.g} ג׳${guess.more.length ? ` (${guess.more.map((u) => `${u.n} ${u.g} ג׳`).join(', ')})` : ''}. אפשר לשנות.`
        : `בדרך כלל ${d.n.trim()} = ${guess.g} ג׳. אפשר לשנות.`)}</p>
    </div>
  );
}

// Saves a new unit on the food and swaps the updated food into ctx.foods.
export const unitSaver = (ctx: Ctx, f: Food, then?: (f: Food) => void) => async (u: Unit) => {
  const nf = await addUnit(f, u);
  ctx.setFoods(ctx.foods.map((x) => (x.id === nf.id ? nf : x)));
  then?.(nf);
};

// What you usually have: saved meals and single foods, with the last amount of each, from the past month.
// `added` (this visit's additions) count as the latest, so a row added at another amount shows that amount.
// Shared by the ＋ window and the day's quick-add row.
function useUsual(ctx: Ctx, date: string, added: Entry[] = []) {
  const [month, setMonth] = useState<Entry[] | null>(null);
  useEffect(() => { loadEntries(addDays(date, -30), date).then(setMonth); }, [date]);
  const last = useMemo(() => {
    const m: Record<string, Entry> = {};
    for (const e of [...month ?? []].sort((a, b) => a.date.localeCompare(b.date)).concat(added)) if (e.foodId) m[e.foodId] = e;
    return m;
  }, [month, added.map((e) => e.id).join()]);
  // Order fixed when the dialog opens: adding moves a food up in "recent", and rows mustn't jump under your finger.
  const [order] = useState(ctx.recent);
  // Saved meals and single foods in one list, by how often you've had them this past month, at any meal, then by
  // the most recent. A saved meal counts each meal that had all of its foods, and those foods don't count again on
  // their own (the morning coffee with ghee is one thing, not three). Water is left out: it has its own line.
  // The same list whatever the meal: the owner wants it to stay put, with what she logs most at the top.
  const usual = useMemo(() => {
    const n: Record<string, number> = {};
    const had: Record<string, Set<string>> = {}; // the foods of each meal eaten: "<date>|<meal>"
    for (const e of month ?? []) if (e.foodId) {
      n[e.foodId] = (n[e.foodId] ?? 0) + 1;
      (had[`${e.date}|${e.meal}`] ??= new Set()).add(e.foodId);
    }
    const byScore = <T extends { score: number }>(xs: T[]) => xs.sort((a, b) => b.score - a.score); // stable: ties stay most recent first
    const saved = ctx.meals.map((m) => {
      const items = mealItems(ctx.foods, m);
      const ids = items.flatMap((it) => (it.foodId ? [it.foodId] : []));
      const score = ids.length ? Object.values(had).filter((s) => ids.every((id) => s.has(id))).length : 0;
      for (const id of ids) n[id] = Math.max(0, (n[id] ?? 0) - score);
      return { key: `m:${m.id}`, m, items, score };
    });
    const foods = byScore(searchFoods(ctx.foods, '', order).filter((f) => !isWater({ foodId: f.id })).map((f) => ({ key: `f:${f.id}`, f, score: n[f.id] ?? 0 }))).slice(0, USUAL_MAX);
    return byScore([...foods, ...saved]);
  }, [ctx.foods, ctx.meals, order, month]);
  return { month, last, usual };
}

// Opens on what you usually eat, saved meals and single foods, each at the amount you had last time.
// One tap on ＋ adds, a second takes it back out, and the dialog stays open until "סיום", so a whole meal is a few taps.
// Tapping a food's name opens the amount picker on last time's amount, for a different amount this time.
// Search, typing and photos are for the less usual things; those go through the amount picker.
// No meal buttons: what's added goes to the meal of the time of day (the owner doesn't care which), and an entry
// can still be moved to another meal from the diary. The phone's back button (or Esc) steps back from the amount
// or typing view to the list, and from the list closes it.
// A nutrition label goes straight in: photo, check the name and values, then the amount; the full form only on "עריכה".
// `left` (what's left of today's goals) opens it on "what fits": the usual things that fit, each still one tap.
// `fromFoods` (a food tapped in the מזונות page) keeps that page's own look: "חזרה לחיפוש", 100 g.
export function AddDialog({ ctx, meal: meal0, date, fromFoods, left, onClose, onAdded, onRemoved, onPhoto, initial }: { ctx: Ctx; meal: MealKey; date: string; fromFoods?: boolean; left?: Goals; onClose: () => void; onAdded: (e: Entry[]) => void; onRemoved?: (e: Entry[]) => void; onPhoto?: (p: MealPhoto) => void; initial?: Food }) {
  const meal = meal0;
  const [q, setQ] = useState('');
  const [writing, setWriting] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]); // picked on the list screen: they wait for a note, then recognition
  const [describe, setDescribe] = useState(''); // a search with no good match, sent to recognition as words
  const [sel, setSel] = useState<Food | null>(initial ?? null);
  const [creating, setCreating] = useState<Partial<Food> | null>(null); // the full new-food form, with what's known
  const [labelShot, setLabelShot] = useState<File | null>(null); // a label photo being read
  const [checking, setChecking] = useState<Partial<Food> | null>(null); // a read label, to check before logging
  const [scanned, setScanned] = useState<File | null>(null); // that label photo, kept with the food once saved
  const [err, setErr] = useState('');
  const uid = useId();
  const [busy, setBusy] = useState(false);
  // What this visit added, keyed by the row that added it ("m:<saved meal>", "f:<food>", or one-off keys).
  const [done, setDone] = useState<Record<string, Entry[]>>({});
  const added = Object.values(done).flat();
  const { month, last, usual } = useUsual(ctx, date, added);
  const hits = useMemo(() => searchFoods(ctx.foods, q, ctx.recent), [ctx.foods, q, ctx.recent]);
  const meals = q ? ctx.meals.filter((m) => norm(m.name).includes(norm(q))) : ctx.meals;
  const [more, setMore] = useState(false);
  // What fits in what's left, at the usual amount (a food never logged has none, so it's out); this visit's additions
  // count as eaten, and stay in the list to take back.
  const [fitting, setFitting] = useState(!!left);
  const leftNow = left && goalsLeft(left, sum(added));
  const priced = usual.flatMap((r) => {
    const n = 'm' in r ? sum(r.items) : last[r.f.id];
    return n ? [{ ...r, kcal: n.kcal, carbs: n.carbs, fat: n.fat, protein: n.protein }] : [];
  });
  const fits = leftNow ? whatFits(priced, leftNow, (r) => !!done[r.key]) : [];
  // Nothing fits: the smallest usual food, whose name opens the amount picker for less of it.
  const closest = priced.flatMap((r) => ('f' in r ? [r] : [])).sort((a, b) => a.kcal - b.kcal)[0];
  const day = date === today() ? '' : ` · ${fmtDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}`;

  // Returns false when the user chose not to add it again (the same food logged in the last half hour).
  const add = async (key: string, items: Item[]) => {
    const again = repeatOf([...month ?? [], ...added].filter((e) => e.date === date), items.filter((i) => !isWater(i)));
    if (again && !(await confirmIt(`כבר רשמת ״${head(again.name)}״ ${again.min ? `לפני ${again.min} דק׳` : 'הרגע'}`, 'הוסף שוב', 'להוסיף שוב?', false))) return false;
    setBusy(true);
    try {
      ctx.addRecent(items.flatMap((i) => (i.foodId ? [i.foodId] : [])));
      const es = await addEntries(date, meal, items);
      onAdded(es);
      setDone((d) => ({ ...d, [key]: [...(d[key] ?? []), ...es] }));
    } finally { setBusy(false); }
    if (initial) onClose(); // opened on one food from the מזונות tab
    setSel(null); setWriting(false); setPhotos([]); setDescribe(''); setQ('');
    return true;
  };
  const readShot = async (file: File) => {
    setErr(''); setLabelShot(file);
    try { setChecking(labelFood(await readLabel(file))); setScanned(file); } catch (x: any) { setErr(x.message); } finally { setLabelShot(null); }
  };
  const created = (f: Food) => { ctx.setFoods([...ctx.foods, f]); setCreating(null); setChecking(null); setSel(f); };
  const saveLabel = async (f: Partial<Food>) => {
    try { const food = await saveFood(ctx.foods, f, scanned); if (food) created(food); } catch (x: any) { setErr(x.message); }
  };
  const takeBack = async (key: string) => {
    const es = done[key];
    setDone(({ [key]: _, ...d }) => d);
    await Promise.all(es.map((e) => client.models.Entry.delete({ id: e.id })));
    onRemoved?.(es);
  };
  const toggle = (key: string, items: () => Item[] | null, food?: Food) => {
    if (busy) return;
    if (done[key]) return takeBack(key);
    const it = items();
    return it ? add(key, it) : setSel(food!); // no amount on record yet: ask once
  };

  const mealPick = (r: { key: string; m: SavedMeal; items: Item[] }) => <Pick key={r.key} saved on={!!done[r.key]} name={r.m.name} detail={mealDetail(r.items)}
    kcal={sum(r.items).kcal} onClick={() => toggle(r.key, () => r.items)} />;
  const foodPick = (r: { key: string; f: Food }) => {
    const e = last[r.f.id];
    return <Pick key={r.key} on={!!done[r.key]} name={r.f.name} mine={r.f.source !== 'moh'} detail={e ? amountLabel(e) : undefined}
      kcal={e?.kcal} onClick={() => toggle(r.key, () => (e ? [pickItem(e)] : null), r.f)} onOpen={() => !busy && setSel(r.f)} />;
  };

  if (creating)
    return (
      <Modal title="מזון חדש" onClose={() => setCreating(null)}>
        <FoodForm foods={ctx.foods} init={creating} scan={checking && scanned} onSaved={created} />
      </Modal>
    );
  return (
    <Modal title={`הוספה ליומן${day}`} onClose={onClose}
      // Always there, so the sheet doesn't grow and shift the rows on the first tap.
      footer={!sel && !writing && !checking && <button className="btn primary" onClick={onClose}>{added.length ? `סיום · נוספו ${added.length} · ${sum(added).kcal} קק״ל` : 'סיום'}</button>}
      onBack={() => { if (sel && !initial) { setSel(null); return true; } if (writing) { setWriting(false); setPhotos([]); setDescribe(''); return true; } if (checking) { setChecking(null); return true; } return false; }}>
      {sel ? (
        <div className="picked">
          {fromFoods && <button className="link" onClick={() => setSel(null)}><Icon name="arrow-right" />חזרה לחיפוש</button>}
          <Amount named key={`${sel.id}:${fromFoods ? '' : last[sel.id]?.id ?? ''}`} food={sel} init={fromFoods ? undefined : last[sel.id] && itemInit(last[sel.id] as Item)} onPick={(it) => add(`f:${sel.id}`, [it])} cta="הוסף" onAddUnit={unitSaver(ctx, sel, setSel)} />
        </div>
      ) : checking ? (
        <LabelCheck food={checking} onSave={saveLabel} onEdit={(f) => setCreating(f)} />
      ) : writing ? (
        <>
          <TextOrPhoto ctx={ctx} files={photos} describe={describe} cta="הוסף" onAdd={async (items, shots) => {
            if (await add(`w:${Date.now()}`, items)) shots.forEach((s) => void savePhoto(s, date, meal).then(onPhoto)); // a failure shows in the app's error banner
          }} />
        </>
      ) : (
        <>
          <input className="search" type="search" aria-label="חיפוש" placeholder="חיפוש מזון…" value={q} onChange={(e) => setQ(e.target.value)} />
          {/* The other ways in, big and up front: a meal photo (camera or gallery), typing the meal, or a package's
              nutrition label (the camera opens at once; the label becomes a food of your own, then you log it) */}
          {!q && <>
            <PhotoPick camera="צילום" gallery="מהגלריה" className="btn big-choice" reading={labelShot} busyText="קורא את התווית…" multiple onFile={(f) => { setPhotos((cur) => [...cur, f].slice(0, MAX_PHOTOS)); setWriting(true); }}>
              <button className="btn big-choice" onClick={() => setWriting(true)}><Icon name="pencil" />כתיבה</button>
              <FileButton camera className="btn big-choice" onFile={readShot}><Icon name="tag" />תווית</FileButton>
            </PhotoPick>
            {err && <p className="error" role="alert">{err}</p>}
          </>}
          <div className="usual">
            {q ? meals.map((m) => mealPick({ key: `m:${m.id}`, m, items: mealItems(ctx.foods, m) })) : fitting && leftNow ? (
              <section aria-labelledby={`${uid}-f`}>
                <h3 id={`${uid}-f`}>מה נכנס ב־{Math.max(0, Math.round(leftNow.kcal))} קק״ל שנותרו</h3>
                {month && (fits.length ? <>
                  <p className="muted small">{leftNow.protein > 0 ? 'מהרגילים שלך, בכמות הרגילה. קודם מה שעשיר בחלבון.' : 'מהרגילים שלך, בכמות הרגילה.'}</p>
                  {fits.map((r) => ('m' in r ? mealPick(r) : foodPick(r)))}
                </> : <>
                  <p className="muted small" role="status">שום דבר מהרגילים שלך לא נכנס בכמות הרגילה.{closest && ' אפשר פחות ממנו: לחצו על השם לבחירת כמות.'}</p>
                  {closest && foodPick(closest)}
                </>)}
                <button className="link" onClick={() => setFitting(false)}>כל הרגילים</button>
              </section>
            ) : <>
              {/* Your usual things, one tap each with last time's amount; ignore them and search, photograph or type instead */}
              {usual.length > 0 && (
                <section aria-labelledby={`${uid}-u`}>
                  <h3 id={`${uid}-u`}>הרגילים שלך</h3>
                  <p className="muted small">לחיצה על ＋ מוסיפה בכמות של הפעם הקודמת. לכמות אחרת, לחצו על השם. <Icon name="utensils" /> ארוחה שמורה. {MINE_HINT}</p>
                  {(more ? usual : usual.slice(0, USUAL_SHOWN)).map((r) => ('m' in r ? mealPick(r) : foodPick(r)))}
                  {!more && usual.length > USUAL_SHOWN && <button className="link" onClick={() => setMore(true)}>עוד {usual.length - USUAL_SHOWN}</button>}
                </section>
              )}
            </>}
            {/* first, so it's seen before scrolling: a restaurant dish the results don't have */}
            {q && <button className="row muted" onClick={() => { setDescribe(q); setWriting(true); }}><Icon name="bulb" />{SMART}: ״{q}״</button>}
            {q && hits.length > 0 && <p className="muted small">{MINE_HINT}</p>}
            {q && hits.map((f) => (
              <FoodHit key={f.id} f={f} onClick={() => setSel(f)} />
            ))}
            {!q && !usual.length && <p className="muted">מה שתרשמו יופיע כאן בפעם הבאה, להוספה בלחיצה אחת.</p>}
            {q && <button className="row muted" onClick={() => setCreating({ name: q })}><Icon name="plus" />מזון חדש: ״{q}״</button>}
          </div>
        </>
      )}
    </Modal>
  );
}

// The day's quick-add row: one tap adds last time's amount to the meal of the time of day, and "בטל" takes it back.
// For what you have daily (the morning coffee) without opening ＋. "עריכה" picks which ones (saved on the profile);
// until then, the most usual things that have calories (black coffee is 0: nothing to count).
// Only what has an amount on record, so a tap never needs a question.
export function QuickAdd({ ctx, date, onAdded, onRemoved }: { ctx: Ctx; date: string; onAdded: (e: Entry[]) => void; onRemoved: (e: Entry[]) => void }) {
  const { last, usual } = useUsual(ctx, date);
  const [just, setJust] = useState<{ name: string; es: Entry[] } | null>(null);
  const [editing, setEditing] = useState(false);
  const uid = useId();
  const offered = usual.flatMap((r) => {
    const items = 'm' in r ? r.items : last[r.f.id] ? [pickItem(last[r.f.id])] : [];
    return items.length ? [{ key: r.key, name: 'm' in r ? r.m.name : r.f.name, saved: 'm' in r, mine: 'f' in r && r.f.source !== 'moh', items }] : [];
  });
  const chosen = ctx.profile?.quick;
  const picks = chosen ? offered.filter((p) => chosen.includes(p.key)) : offered.filter((p) => sum(p.items).kcal > 0).slice(0, QUICK_SHOWN);
  if (!offered.length) return null;
  const add = async (p: (typeof picks)[number]) => {
    ctx.addRecent(p.items.flatMap((i) => (i.foodId ? [i.foodId] : [])));
    const es = await addEntries(date, mealNow(), p.items);
    onAdded(es);
    const now = { name: p.name, es };
    setJust(now);
    setTimeout(() => setJust((j) => (j === now ? null : j)), 6000);
  };
  const undo = async ({ es }: { es: Entry[] }) => {
    setJust(null);
    await Promise.all(es.map((e) => client.models.Entry.delete({ id: e.id })));
    onRemoved(es);
  };
  // none chosen: back to automatic
  const save = async (keys: string[]) => {
    setEditing(false);
    const quick = keys.length ? keys : null;
    ctx.setProfile({ ...ctx.profile!, quick });
    await client.models.Profile.update({ id: ctx.profile!.id, quick });
  };
  return (
    <section aria-labelledby={`${uid}-q`}>
      <div className="group-head">
        <h3 id={`${uid}-q`} className="small muted">הוספה מהירה</h3>
        <button className="link" aria-label="עריכת הוספה מהירה" onClick={() => setEditing(true)}>עריכה</button>
      </div>
      <ul className="chips">
        {picks.map((p) => (
          <li key={p.key}>
            <button onClick={() => add(p)}>
              {/* only the name's head shows (MoH names run long); screen readers get all of it */}
              {p.saved && <Icon name="utensils" />}<span className="grow">{head(p.name)}</span><span className="sr-only">{p.name.slice(head(p.name).length)}</span>
              {p.saved && <span className="sr-only"> (ארוחה שמורה)</span>}
              <small className="muted">{sum(p.items).kcal}<span className="sr-only"> קק״ל</span></small>
            </button>
          </li>
        ))}
      </ul>
      {just && <div className="toast" role="status">נוסף ״{head(just.name)}״ ל{placeOf(just.es)} <button onClick={() => undo(just)}>בטל</button></div>}
      {editing && <QuickEdit offered={offered} chosen={picks.map((p) => p.key)} onSave={save} onClose={() => setEditing(false)} />}
    </section>
  );
}

// Which of the usual things the quick add offers: tap to choose, tap again to leave out, most usual first.
function QuickEdit({ offered, chosen, onSave, onClose }: { offered: { key: string; name: string; saved: boolean; mine: boolean; items: Item[] }[]; chosen: string[]; onSave: (keys: string[]) => void; onClose: () => void }) {
  const [on, setOn] = useState(() => new Set(chosen));
  const toggle = (key: string) => setOn((cur) => { const next = new Set(cur); if (!next.delete(key)) next.add(key); return next; });
  return (
    <Modal title="עריכת הוספה מהירה" onClose={onClose}
      footer={<button className="btn primary" onClick={() => onSave(offered.flatMap((p) => (on.has(p.key) ? [p.key] : [])))}>שמירה</button>}>
      <p className="muted small">מהרגילים שלך, בכמות של הפעם הקודמת. <Icon name="utensils" /> ארוחה שמורה. {MINE_HINT}</p>
      <p className="muted small" role="status">{on.size ? `נבחרו ${on.size}` : 'לא נבחר כלום: יוצגו הרגילים ביותר'}</p>
      <div className="usual">
        {offered.map((p) => (
          <Pick key={p.key} name={p.name} saved={p.saved} mine={p.mine} detail={p.saved ? mealDetail(p.items) : amountLabel(p.items[0])}
            kcal={sum(p.items).kcal} on={on.has(p.key)} onClick={() => toggle(p.key)} />
        ))}
      </div>
    </Modal>
  );
}

const mealDetail = (items: Item[]) => items.map((i) => head(i.name)).join(' · ');

const QUICK_SHOWN = 6;

const USUAL_SHOWN = 10;
const USUAL_MAX = 30; // single foods behind "עוד"; saved meals are all there

// A nutrition label just read: the product's name and values to check against the package, then on to the amount.
// "עריכה" opens the full form with everything filled in (vitamins, units), for what the label got wrong.
function LabelCheck({ food, onSave, onEdit }: { food: Partial<Food>; onSave: (f: Partial<Food>) => void; onEdit: (f: Partial<Food>) => void }) {
  const [name, setName] = useState(food.name ?? '');
  const why = useId();
  const unit = json<Unit[]>(food.units, [])[0];
  const per = food.servingG === 100 ? '100 גרם' : unit ? `${unit.n} אחת` : `${food.servingG} גרם`;
  return (
    <div className="form">
      <p className="muted small" role="status">נקרא מהתווית. כדאי לבדוק מול האריזה.</p>
      <label><span>שם המוצר</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <p className="muted small">הערכים ל{per}:</p>
      <NutLine n={food as Nut} />
      <div className="grid2">
        <button className="btn" onClick={() => onEdit({ ...food, name })}><Icon name="pencil" />עריכה</button>
        <button className="btn primary" disabled={!name.trim()} aria-describedby={name.trim() ? undefined : why} onClick={() => onSave({ ...food, name: name.trim() })}>המשך</button>
      </div>
      {!name.trim() && <Why id={why}>כתבו את שם המוצר כדי להמשיך</Why>}
    </div>
  );
}

// Which meal an entry goes to: four tabs, the chosen one pressed.
const MealSeg = ({ meal, onChange }: { meal: MealKey; onChange: (m: MealKey) => void }) => (
  <div className="seg" role="group" aria-label="ארוחה">
    {MEALS.map((m) => <button key={m.key} className={meal === m.key ? 'on' : ''} aria-pressed={meal === m.key} onClick={() => onChange(m.key)}><Icon name={m.icon} />{m.short}</button>)}
  </div>
);

// A usual thing: tap adds it, tap again takes it out. With onOpen, only ＋ does that, and the name opens the amount picker.
// A saved meal is marked with the utensils icon, named for screen readers too; a food of your own is tagged "שלי".
function Pick({ name, detail, kcal, on, saved, mine, onClick, onOpen }: { name: string; detail?: string; kcal?: number; on: boolean; saved?: boolean; mine?: boolean; onClick: () => void; onOpen?: () => void }) {
  const body = <>
    <div className="grow">
      <div>{saved && <Icon name="utensils" />}{name}{saved && <span className="sr-only"> (ארוחה שמורה)</span>}</div>
      {(mine || detail) && <small className="muted">{mine && <span className="tag">שלי</span>}{detail}</small>}
    </div>
    {kcal != null && <span className="kcal">{kcal}</span>}
  </>;
  const mark = <span className="mark"><Icon name={on ? 'check' : 'plus'} /></span>;
  if (!onOpen) return <button className={`row pick${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick}>{body}{mark}</button>;
  return (
    <div className={`row static pick${on ? ' on' : ''}`}>
      <button className="grow" onClick={onOpen}>{body}</button>
      <button className="icon" aria-label={`הוסף: ${name}`} aria-pressed={on} onClick={onClick}>{mark}</button>
    </div>
  );
}

// The picked photos (more can be added: another angle, the drink) with a note for what a photo can't tell
// (the cheese, the pasta, what's inside), then read together.
function PhotoNote({ files, setFiles, note, setNote, onRead }: { files: File[]; setFiles: (f: File[]) => void; note: string; setNote: (s: string) => void; onRead: () => void }) {
  return (
    <div className="form">
      <ul className="thumbs" aria-label="התמונות שנבחרו">
        {files.map((f, i) => <Thumb key={`${i}:${f.name}`} file={f} n={i + 1} onRemove={() => setFiles(files.filter((x) => x !== f))} />)}
      </ul>
      {files.length < MAX_PHOTOS && <PhotoPick camera="עוד צילום" gallery="עוד מהגלריה" multiple onFile={(f) => setFiles([...files, f].slice(0, MAX_PHOTOS))} />}
      <label>
        <span>הערה (לא חובה): מה לא רואים או קשה לזהות</span>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="גבינה בולגרית מגורדת, פסטה רגילה, כף שמן" />
      </label>
      <button className="btn primary" onClick={onRead}>זהה מזונות</button>
    </div>
  );
}

function Thumb({ file, n, onRemove }: { file: File; n: number; onRemove: () => void }) {
  const src = usePhotoUrl(file);
  return (
    <li>
      {src && <img src={src} alt={`תמונה ${n}`} />}
      <button className="icon" aria-label={`הסר תמונה ${n}`} onClick={onRemove}><Icon name="x" /></button>
    </li>
  );
}

// A whole meal in one go: typed ("יוגורט 150 גרם, 10 ענבים") or from photos, then checked in a review list.
// Photos, or words sent to "זיהוי חכם" (a restaurant dish the search doesn't know), go to the AI: it may ask a
// question or two first, then matches each food to the database, or breaks a dish it lacks into ingredients.
// `describe`: words from the search, read at once. `shots` are the photos the list came from, kept with the meal.
type Asking = { seen: Seen; said: string; files: File[] };
function TextOrPhoto({ ctx, files = [], describe, cta, onAdd }: { ctx: Ctx; files?: File[]; describe?: string; cta: string; onAdd: (items: Item[], shots: File[]) => void }) {
  const [text, setText] = useState(describe ?? '');
  const [parsed, setParsed] = useState<Parsed[] | null>(null);
  const [busy, setBusy] = useState<{ file: File | null; text: string } | null>(null); // being read, with what to show
  const [ask, setAsk] = useState<Asking | null>(null);
  const [shots, setShots] = useState<File[]>([]);
  const [err, setErr] = useState('');
  const why = useId();
  const [picked, setPicked] = useState(files); // photos waiting for their note before they're read (from the list screen too)
  const match = async (a: Asking, answers: (string | undefined)[]) => {
    setAsk(null); setBusy({ file: a.files[0] ?? null, text: 'מתאים למאגר המזון…' });
    try { setParsed(await matchMeal(ctx.foods, ctx.recent, a.seen, a.said, answers)); setShots(a.files); } finally { setBusy(null); }
  };
  const read = async (fs: File[], said: string) => {
    setErr(''); setPicked([]); setBusy({ file: fs[0] ?? null, text: fs.length ? 'מזהה מזונות בתמונה…' : 'מזהה את המנה…' });
    try {
      const seen = await readMeal(fs, said);
      if (seen.questions.length) setAsk({ seen, said, files: fs });
      else await match({ seen, said, files: fs }, []);
    } catch (x: any) { setErr(x.message); } finally { setBusy(null); }
  };
  useEffect(() => { if (describe) void read([], describe); }, [describe]);
  if (parsed)
    return (
      <>
        <ReviewList ctx={ctx} parsed={parsed} cta={cta} onAdd={(items) => onAdd(items, shots)} />
      </>
    );
  if (ask) return <Questions questions={ask.seen.questions} onDone={(answers) => match(ask, answers)} />;
  if (picked.length)
    // the note is the same text as the typed meal, so it stays in view while the photos are read
    return <PhotoNote files={picked} setFiles={setPicked} note={text} setNote={setText} onRead={() => read(picked, text)} />;
  const empty = !text.trim();
  return (
    <div className="form">
      {busy ? <Reading file={busy.file} text={busy.text} /> : <PhotoPick camera="צילום" gallery="מהגלריה" multiple onFile={(f) => setPicked((cur) => [...cur, f].slice(0, MAX_PHOTOS))} />}
      {/* While something is being read the text stays in view, locked, and the buttons go: nothing to press until it's done */}
      <fieldset className="form" disabled={!!busy}>
        <label>
          <span>מה אכלת? אפשר עם כמויות, מופרד בפסיקים</span>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="יוגורט 150 גרם, 10 ענבים, כף חמאת בוטנים, 2 כפות גרנולה" autoFocus={!files.length && !describe} />
        </label>
        {!busy && <>
          <div className="grid2">
            <button className="btn" disabled={empty} aria-describedby={empty ? why : undefined} onClick={() => read([], text)}><Icon name="bulb" />{SMART}</button>
            <button className="btn primary" disabled={empty} aria-describedby={empty ? why : undefined} onClick={() => setParsed(parseLine(text))}>המשך לבדיקה</button>
          </div>
          {empty ? <Why id={why}>כתבו מה אכלתם כדי להמשיך</Why>
            : <p className="muted small">{SMART}: למנה ממסעדה או משהו שהחיפוש לא מכיר. שואל אם צריך, ומפרק למרכיבים מה שאין במאגר.</p>}
        </>}
      </fieldset>
      {err && <p className="error">{err}</p>}
    </div>
  );
}
const SMART = 'זיהוי חכם';

// The AI's questions, where the answer changes the calories a lot ("creamy or clear?"): one tap each.
// Unanswered ones are left to its own guess.
function Questions({ questions, onDone }: { questions: Question[]; onDone: (answers: (string | undefined)[]) => void }) {
  const [answers, setAnswers] = useState<(string | undefined)[]>([]);
  const answer = (n: number, a: string) => setAnswers((x) => Object.assign([...x], { [n]: x[n] === a ? undefined : a }));
  return (
    <div className="form">
      <h3>כמה שאלות קצרות, כדי לדייק</h3>
      {questions.map((q, n) => (
        <fieldset key={n}>
          <legend>{q.text}</legend>
          <div className="seg">
            {q.options.map((o) => <button key={o} aria-pressed={answers[n] === o} className={answers[n] === o ? 'on' : ''} onClick={() => answer(n, o)}>{o}</button>)}
          </div>
        </fieldset>
      ))}
      <button className="btn primary" onClick={() => onDone(answers)}>המשך</button>
    </div>
  );
}

// `photos`: the meal's photos, opened by `onPhoto`.
export function EntryDialog({ ctx, entry, photos, onPhoto, onClose, onSaved, onDelete }: { ctx: Ctx; entry: Entry; photos: MealPhoto[]; onPhoto: (p: MealPhoto) => void; onClose: () => void; onSaved: (e: Entry) => void; onDelete: () => void }) {
  const [meal, setMeal] = useState(entry.meal as MealKey);
  const real = ctx.foods.find((x) => x.id === entry.foodId);
  const food = useMemo(() => itemFood(ctx.foods, entry as Item), [ctx.foods, entry]);
  const save = async (it: Item) => {
    const { data } = await client.models.Entry.update({ id: entry.id, meal, ...it });
    onSaved(data!);
  };
  return (
    <Modal title={entry.name} onClose={onClose}>
      <div className="muted small">{isDish(entry) && <><AiTag />מנה שאינה במאגר: הערכים מסכום המרכיבים שנבדקו. </>}{amountLabel(entry)}</div>
      {photos.length > 0 && (
        <div className="meal-photos">
          {photos.map((p, i) => <button key={p.path} aria-label={`תמונה ${i + 1}: ${MEALS.find((m) => m.key === p.meal)!.label}`} onClick={() => onPhoto(p)}><img src={p.url} alt="" /></button>)}
        </div>
      )}
      <MealSeg meal={meal} onChange={setMeal} />
      <Amount food={food} init={itemInit(entry as Item)} onPick={save} cta="שמור"
        onAddUnit={real ? unitSaver(ctx, real) : undefined} />
      <button className="btn danger" onClick={onDelete}>מחק</button>
    </Modal>
  );
}

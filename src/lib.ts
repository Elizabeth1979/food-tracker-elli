import type { IconName } from './icons';
import { client, hasPending, listEntries, supabase, syncPending, type Food, type SavedMeal, type Weight } from './db';
import { GRAMS, candidatesFor, json, per100, pickedParsed, seenParsed, unitsOf, type Parsed, type Picked, type Question, type SeenItem, type Unit } from './search';

export { client, hasPending, syncPending };
export { GRAMS, json, unitsOf, searchFoods, matchFoods, parseLine, splitAnd, unitFor, isFFQ, kcalOff, sameFood, type Unit, type Parsed, type Question } from './search';
export type { Food, Entry, SavedMeal, Profile, BodyInfo, Weight } from './db';
export type MealKey = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const MICROS = [
  { key: 'sodium', label: 'נתרן', unit: 'מ״ג', dp: 0 },
  { key: 'calcium', label: 'סידן', unit: 'מ״ג', dp: 0 },
  { key: 'potassium', label: 'אשלגן', unit: 'מ״ג', dp: 0 },
  { key: 'b12', label: 'B12', unit: 'מק״ג', dp: 2 },
] as const;
export type MicroKey = (typeof MICROS)[number]['key'];
// A column's "name (unit)" key, the same shape as VITAMINS: "נתרן (מ״ג)".
export const microKey = (m: (typeof MICROS)[number]) => `${m.label} (${m.unit})`;
// Vitamins and minerals beyond the four columns above, mostly from supplement labels: { "ויטמין D (מק״ג)": 25, … }.
// The label reader is given these names, so one nutrient adds up across foods; anything else keeps its printed name and unit.
export const VITAMINS = [
  'ויטמין A (מק״ג)', 'ויטמין D (מק״ג)', 'ויטמין E (מ״ג)', 'ויטמין K (מק״ג)', 'ויטמין C (מ״ג)',
  'ויטמין B1 (מ״ג)', 'ויטמין B2 (מ״ג)', 'ויטמין B3 (מ״ג)', 'ויטמין B5 (מ״ג)', 'ויטמין B6 (מ״ג)', 'ביוטין (מק״ג)', 'חומצה פולית (מק״ג)',
  'ברזל (מ״ג)', 'מגנזיום (מ״ג)', 'אבץ (מ״ג)', 'סלניום (מק״ג)', 'יוד (מק״ג)', 'נחושת (מ״ג)', 'מנגן (מ״ג)', 'כרום (מק״ג)', 'מוליבדן (מק״ג)',
  'זרחן (מ״ג)', 'כולין (מ״ג)', 'אומגה 3 (מ״ג)',
];
// The ones every MoH food carries (scripts/moh-vitamins.ts), shown in the day even at 0. The rest come from labels only.
export const LABEL_ONLY = ['ביוטין (מק״ג)', 'יוד (מק״ג)', 'כרום (מק״ג)', 'מוליבדן (מק״ג)', 'אומגה 3 (מ״ג)'];
export const FOOD_VITAMINS = VITAMINS.filter((k) => !LABEL_ONLY.includes(k));
export type Extra = Record<string, number>;
export type Nut = { kcal: number; carbs: number; fat: number; protein: number; extra?: Extra | null } & Partial<Record<MicroKey, number | null>>;
export type Item = Nut & { foodId?: string | null; name: string; grams: number; qty?: number | null; unit?: string | null };

// Water is logged as ordinary 0-kcal entries, a glass at a time, so it syncs, backs up and undoes like any food.
// The diary counts the plain waters of the MoH database (also when found by search) on their own line, not under a meal.
export const WATER: Item = { foodId: 'moh-9593', name: 'מים', grams: 250, qty: 1, unit: 'כוס', kcal: 0, carbs: 0, fat: 0, protein: 0 };
export const WATER_GOAL_ML = 2000;
const WATERS = new Set(['moh-9593', 'moh-4949', 'moh-10140', 'moh-4950', 'moh-4951', 'moh-4842']);
export const isWater = (e: { foodId?: string | null }) => WATERS.has(e.foodId ?? '');

// A food's name before its details: "קפה" of "קפה, מוכן מקפה טחון". For short lists; screen readers get the rest.
export const head = (name: string) => name.split(',')[0];
export const MEALS: { key: MealKey; label: string; short: string; icon: IconName }[] = [
  { key: 'breakfast', label: 'ארוחת בוקר', short: 'בוקר', icon: 'sunrise' },
  { key: 'lunch', label: 'ארוחת צהריים', short: 'צהריים', icon: 'sun' },
  { key: 'dinner', label: 'ארוחת ערב', short: 'ערב', icon: 'moon' },
  { key: 'snack', label: 'נשנושים ואחר', short: 'נשנושים', icon: 'apple' },
];
// Where added entries show in the diary, for "added to …" messages: water has its own line, not the meal of the hour.
export const placeOf = (es: { meal?: string | null; foodId?: string | null }[], long = false) =>
  es.length && es.every(isWater) ? 'שתייה' : MEALS.find((m) => m.key === es[0]?.meal)?.[long ? 'label' : 'short'] ?? 'יומן';
export const MACROS = [
  { key: 'carbs', label: 'פחמימות', color: 'var(--carbs)', kcalPerG: 4 },
  { key: 'fat', label: 'שומן', color: 'var(--fat)', kcalPerG: 9 },
  { key: 'protein', label: 'חלבון', color: 'var(--protein)', kcalPerG: 4 },
] as const;

// ---------- dates (local timezone) ----------
export const today = () => new Date().toLocaleDateString('en-CA');
export const mealNow = (): MealKey => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack'; };
export const addDays = (d: string, n: number) => {
  const x = new Date(d + 'T12:00:00');
  x.setDate(x.getDate() + n);
  return x.toLocaleDateString('en-CA');
};
export const fmtDate = (d: string, o: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) =>
  new Date(d + 'T12:00:00').toLocaleDateString('he-IL', o);
export const daysBetween = (a: string, b: string) => {
  const out: string[] = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
};

// ---------- nutrition math ----------
const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;
const r1 = (x: number) => round(x, 1);
const r2 = (x: number) => round(x, 2);
const scaleExtra = (x: Extra | null | undefined, f: number) => (x ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, r2(v * f)])) : x);
const addExtra = (a: Extra | null | undefined, b: Extra | null | undefined) => {
  if (!b) return a;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = r2((out[k] ?? 0) + v);
  return out;
};
export const scale = (n: Nut, f: number): Nut => ({
  kcal: Math.round(n.kcal * f), carbs: r1(n.carbs * f), fat: r1(n.fat * f), protein: r1(n.protein * f),
  ...Object.fromEntries(MICROS.map((m) => [m.key, n[m.key] == null ? null : round(n[m.key]! * f, m.dp)])),
  extra: scaleExtra(n.extra, f),
});
export const sum = (xs: Nut[]): Nut =>
  xs.reduce<Nut>((a, x) => ({
    kcal: a.kcal + x.kcal, carbs: r1(a.carbs + x.carbs), fat: r1(a.fat + x.fat), protein: r1(a.protein + x.protein),
    ...Object.fromEntries(MICROS.map((m) => [m.key, round((a[m.key] ?? 0) + (x[m.key] ?? 0), m.dp)])),
    extra: addExtra(a.extra, x.extra),
  }), { kcal: 0, carbs: 0, fat: 0, protein: 0, ...Object.fromEntries(MICROS.map((m) => [m.key, 0])) });
// A dish the database lacks, logged from its ingredients: one line under the dish's name, its values their sum.
// No food behind it, so editing the amount scales the whole dish (in grams).
export const dishItem = (name: string, parts: Item[]): Item =>
  ({ ...sum(parts), foodId: null, name, grams: r1(parts.reduce((g, p) => g + p.grams, 0)), qty: null, unit: null });
export const isDish = (e: { foodId?: string | null }) => !e.foodId;
// the fields an Entry / saved-meal item carries (strips ids, dates, owner…)
export const pickItem = (e: Item): Item => {
  const { foodId, name, grams, qty, unit, kcal, carbs, fat, protein } = e;
  return { foodId, name, grams, qty, unit, kcal, carbs, fat, protein, ...Object.fromEntries(MICROS.map((m) => [m.key, e[m.key] ?? null])), extra: e.extra ?? null };
};
// The extras that have a value, in VITAMINS order then the rest, split into name and unit: "ויטמין D (מק״ג)" → ויטמין D, מק״ג.
const extraList = (x: Extra | null | undefined, zeros = false) => Object.entries(x ?? {})
  .filter(([, v]) => zeros || v)
  .sort(([a], [b]) => ((VITAMINS.indexOf(a) + 1 || 99) - (VITAMINS.indexOf(b) + 1 || 99)))
  .map(([key, v]) => { const [, name, unit] = key.match(/^(.*?)\s*\((.+)\)$/) ?? [, key, '']; return { key, name, unit, v }; });
// For display in one line: "ויטמין D 25 מק״ג".
export const extraParts = (x: Extra | null | undefined) => extraList(x).map((m) => `${m.name} ${m.v}${m.unit ? ` ${m.unit}` : ''}`);
// Every vitamin and mineral, one each, keyed "name (unit)" like VITAMINS: the four columns and FOOD_VITAMINS even at 0
// (food carries them), then any other a label added.
export const microAmounts = (n: Nut) => [
  ...MICROS.map((m) => ({ key: microKey(m), name: m.label as string, unit: m.unit as string, v: n[m.key] ?? 0 })),
  ...extraList({ ...Object.fromEntries(FOOD_VITAMINS.map((k) => [k, 0])), ...n.extra }, true),
];
export type MicroAmount = ReturnType<typeof microAmounts>[number];
// One vitamin or mineral of a food or a day by its "name (unit)" key: one of the four columns, or from extra.
export const microOf = (n: Nut, key: string) => { const m = MICROS.find((x) => microKey(x) === key); return (m ? n[m.key] : n.extra?.[key]) ?? 0; };
// Where a vitamin or mineral came from: the foods that have it, the same food logged twice added up, most first.
export const microSources = (items: Item[], key: string) => {
  const by = new Map<string, number>();
  for (const e of items) { const v = microOf(e, key); if (v) by.set(e.name, (by.get(e.name) ?? 0) + v); }
  return [...by].map(([name, v]) => ({ name, v: r2(v) })).sort((a, b) => b.v - a.v);
};
export const itemFor = (f: Food, qty: number, unit: Unit): Item => {
  const grams = r1(qty * unit.g);
  return { foodId: f.id, name: f.name, grams, qty, unit: unit.n, ...scale(f as Nut, grams / f.servingG) };
};
// A saved meal's foods at their current values, so fixing a food (a misread label) fixes every meal that has it.
// A food no longer there keeps the meal's own copy.
export const mealItems = (foods: Food[], m: SavedMeal): Item[] => json<Item[]>(m.items, []).map((it) => {
  const f = it.foodId ? foods.find((x) => x.id === it.foodId) : undefined;
  return f ? { ...it, name: f.name, ...scale(f as Nut, it.grams / f.servingG) } : it;
});
export const amountLabel = (e: { grams: number; qty?: number | null; unit?: string | null }) =>
  e.unit && e.unit !== GRAMS ? `${e.qty} ${e.unit} (${e.grams} ג׳)` : `${e.grams} ג׳`;

// ---------- data ----------
// The MoH (Tzameret) database is read from /foods/moh.json at runtime and never copied into the DB.
// Local Food rows override MoH rows with the same id (edits, `hidden`); other local rows are the user's own foods.
let moh: Promise<Food[]> | undefined;
export const loadMoh = (): Promise<Food[]> =>
  (moh ??= fetch('/foods/moh.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`moh.json ${r.status}`)))).catch((e) => { moh = undefined; console.error(e); return []; }));

export async function loadFoods(): Promise<Food[]> {
  const [base, { data: local }] = await Promise.all([loadMoh(), client.models.Food.list()]);
  const own = new Map(local.map((f) => [f.id, f]));
  // a row saved before MoH foods had vitamins keeps them from the file
  const merged = base.map((f) => { const o = own.get(f.id); return o ? { ...f, ...o, extra: o.extra ?? f.extra } : f; });
  const ids = new Set(base.map((f) => f.id));
  return [...merged, ...local.filter((f) => !ids.has(f.id) && f.name)];
}
export const loadSavedMeals = async () => (await client.models.SavedMeal.list()).data;
export const loadEntries = listEntries;

// Adds a unit ("פרוסה" = 20 g) to a food. A MoH food gets its first local row this way, so the whole food is sent.
export async function addUnit(food: Food, unit: Unit): Promise<Food> {
  const units = [...json<Unit[]>(food.units, []).filter((u) => u.n !== unit.n), unit];
  const { data } = await client.models.Food.update({ ...food, units: JSON.stringify(units) });
  return { ...food, ...data, units };
}

export const addEntries = (date: string, meal: MealKey, items: Item[]) =>
  Promise.all(items.map((it) => client.models.Entry.create({ ...it, date, meal }).then((r) => r.data)));

export { store } from './store';

// ---------- photo ----------
// Shrinks the photo on the device (cost and upload time follow the pixel count, recognition doesn't need more),
// then asks the meal-photo Edge Function which foods it shows.
async function shrunk(file: File, max: number) {
  const img = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
const shrink = async (file: File, max = 1024) => (await shrunk(file, max)).toDataURL('image/jpeg', 0.8).split(',')[1];
// Several photos of one meal (another angle, the drink) are read together, so a food two photos show counts once.
export const MAX_PHOTOS = 4; // the meal-photo function's limit too
export type Seen = { items: SeenItem[]; questions: Question[] };
// What's in a meal: from its photos (with the user's note), or with none from a description alone ("מרק תירס ממסעדת סושי").
export async function readMeal(files: File[], note: string): Promise<Seen> {
  const images = await Promise.all(files.map((f) => shrink(f)));
  const { data, error } = await supabase.functions.invoke<Partial<Seen> & { error?: string }>('meal-photo', { body: { images, note } });
  if (error || !data?.items) throw new Error(data?.error ?? (files.length ? 'זיהוי התמונה לא זמין כרגע. אפשר לכתוב את הארוחה במקום.' : 'הזיהוי לא זמין כרגע. אפשר לבדוק את הרשימה בלעדיו.'));
  return { items: data.items, questions: data.questions ?? [] };
}
// Then the AI matches each item to one of its closest database foods (with the note and the answers given), or breaks
// a dish the database lacks into ingredients, which are matched the same way in turn.
export async function matchMeal(foods: Food[], recent: string[], seen: Seen, note: string, answers: (string | undefined)[]): Promise<Parsed[]> {
  const asked = seen.items.map((_, k) => seen.questions.flatMap((q, n) => (q.item === k && answers[n] ? [`${q.text} ${answers[n]}`] : [])));
  // A guessed fat the user answered about isn't a guess any more ("בלי" drops it in pickedParsed)
  const items = seen.items.map((i, k) => (asked[k].length ? { ...i, hidden: false } : i));
  const first = await pickFoods(foods, recent, items, note, asked, true);
  const parts = first.filter((p) => p.dish);
  if (!parts.length) return first;
  const more = await pickFoods(foods, recent, parts.map((p) => ({ name: p.query, qty: p.qty ?? 1, unit: p.unit ?? GRAMS, grams: p.grams })), note, parts.map((p) => [`מרכיב של ${p.dish}`]), false);
  let n = 0;
  return first.map((p) => (p.dish ? { ...more[n++], dish: p.dish } : p));
}
// One round of picking. If it fails, the search's own matches stand.
async function pickFoods(foods: Food[], recent: string[], seen: SeenItem[], note: string, answers: string[][], parts: boolean): Promise<Parsed[]> {
  const cands = candidatesFor(foods, seen, recent);
  const items = seen.map((i, k) => ({ ...i, answers: answers[k], candidates: cands[k].map((f) => ({ id: f.id, name: f.name, kcal: per100(f) })) }));
  try {
    const { data, error } = await supabase.functions.invoke<{ items?: Picked[] }>('meal-photo', { body: { mode: 'pick', note, items } });
    if (error || !data?.items) throw error ?? new Error('no picks');
    return pickedParsed(seen, parts ? data.items : data.items.map((p) => ({ ...p, parts: [] })), cands);
  } catch (e) {
    console.error(e);
    return seen.map((i) => seenParsed(i));
  }
}
// Reads a nutrition table (טבלת ערכים תזונתיים) into per-100 g values for the new-food form. The one exception to
// "calories come from the database": a packaged product the database lacks, checked by the user before saving.
// A supplement label that gives no weight comes back per piece instead (basisG 1, unit "טבליה" = 1 g).
// Labels have small print, so the photo is kept larger than for a meal.
export type Label = Nut & { name: string; unit: Unit | null; perServing: boolean; basisG: number };
export async function readLabel(file: File): Promise<Label> {
  const { data, error } = await supabase.functions.invoke<{ label?: Label; error?: string }>('meal-photo', { body: { image: await shrink(file, 1568), mode: 'label', names: VITAMINS } });
  if (error || !data?.label) throw new Error(data?.error ?? 'קריאת הטבלה לא זמינה כרגע. אפשר למלא את הערכים ידנית.');
  return data.label;
}

// ---------- meal photos ----------
// A meal photo is kept so the diary can show it: in the private Storage bucket meal-photos, at
// <user>/<date>/<meal>.<id>.jpg (Storage policies allow only the user's own folder). The path says where it
// belongs, so there is no table. Photos need a connection: offline, saving fails and the diary shows none.
export type MealPhoto = { path: string; meal: MealKey; url: string };
const photos = () => supabase.storage.from('meal-photos');
const userId = async () => (await supabase.auth.getSession()).data.session!.user.id;
async function signed(paths: string[]): Promise<MealPhoto[]> {
  const { data, error } = await photos().createSignedUrls(paths, 3600);
  if (error) throw error;
  return data.flatMap((d) => (d.path && d.signedUrl ? [{ path: d.path, meal: d.path.split('/')[2].split('.')[0] as MealKey, url: d.signedUrl }] : []));
}
const jpegOf = async (file: File, max: number) => {
  const c = await shrunk(file, max);
  return new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), 'image/jpeg', 0.8));
};
export async function savePhoto(file: File, date: string, meal: MealKey): Promise<MealPhoto> {
  const path = `${await userId()}/${date}/${meal}.${crypto.randomUUID()}.jpg`;
  const { error } = await photos().upload(path, await jpegOf(file, 1024), { contentType: 'image/jpeg' });
  if (error) throw error;
  return (await signed([path]))[0];
}
// The names one level down in a folder (files, or the day folders), oldest first; Storage pages its lists.
async function names(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await photos().list(dir, { limit: 1000, offset, sortBy: { column: 'created_at', order: 'asc' } });
    if (error) throw error;
    out.push(...data.map((f) => f.name));
    if (data.length < 1000) return out;
  }
}
export async function listPhotos(date: string): Promise<MealPhoto[]> {
  if (!navigator.onLine) return [];
  const dir = `${await userId()}/${date}`;
  const files = await names(dir);
  return files.length ? signed(files.map((f) => `${dir}/${f}`)) : [];
}
// To another meal of the same day: only the file name's meal changes.
export async function movePhoto(p: MealPhoto, meal: MealKey): Promise<MealPhoto> {
  const to = p.path.replace(/\/[^/.]+\.([^/]+)$/, `/${meal}.$1`);
  const { error } = await photos().move(p.path, to);
  if (error) throw error;
  return (await signed([to]))[0];
}
export async function deletePhoto(p: MealPhoto) {
  const { error } = await photos().remove([p.path]);
  if (error) throw error;
}

// The label photo a food's values were read from, kept at <user>/labels/<food id>.jpg to check them against later.
// A new scan of the same food replaces it.
const labelPath = async (foodId: string) => `${await userId()}/labels/${foodId}.jpg`;
export async function saveLabelPhoto(file: File, foodId: string) {
  const { error } = await photos().upload(await labelPath(foodId), await jpegOf(file, 1568), { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
}
export async function labelPhotoUrl(foodId: string): Promise<string | null> {
  if (!navigator.onLine) return null;
  const { data } = await photos().createSignedUrls([await labelPath(foodId)], 3600);
  return data?.[0]?.signedUrl ?? null;
}

// Backups carry the photos as base64 JPEGs, each by its path inside the user's folder (<date>/<meal>.<id>.jpg,
// and labels/<food id>.jpg).
export type PhotoFile = { path: string; jpeg: string };
const toBase64 = (b: Blob) => new Promise<string>((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok((r.result as string).split(',')[1]);
  r.onerror = () => fail(r.error);
  r.readAsDataURL(b);
});
export async function exportPhotos(): Promise<PhotoFile[]> {
  const me = await userId();
  const paths = (await Promise.all((await names(me)).map(async (day) => (await names(`${me}/${day}`)).map((f) => `${day}/${f}`)))).flat();
  return Promise.all(paths.map(async (path) => {
    const { data, error } = await photos().download(`${me}/${path}`);
    if (error) throw error;
    return { path, jpeg: await toBase64(data) };
  }));
}
// Puts the backup's photos back in the user's folder; photos already there stay.
export async function restorePhotos(files: PhotoFile[]) {
  const me = await userId();
  for (const { path, jpeg } of files) {
    const body = new Blob([Uint8Array.from(atob(jpeg), (c) => c.charCodeAt(0))], { type: 'image/jpeg' });
    const { error } = await photos().upload(`${me}/${path}`, body, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
  }
}

// One weigh-in a day: a second one that day replaces it. Returns the new list, oldest first.
export async function saveWeight(weights: Weight[], kg: number, waist: number | null): Promise<Weight[]> {
  const row = { id: weights.find((w) => w.date === today())?.id, date: today(), kg, waist };
  const { data } = row.id ? await client.models.Weight.update(row as Weight) : await client.models.Weight.create(row);
  return [...weights.filter((w) => w.id !== data.id), data].sort((a, b) => a.date.localeCompare(b.date));
}

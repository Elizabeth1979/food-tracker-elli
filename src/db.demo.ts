// Test mode (`npm run dev:test`): stands in for db.ts so the app runs with no sign-in and no Supabase.
// Data lives in this browser's localStorage under one key. Vite swaps it in for './db' only in `--mode demo`
// (vite.config.ts), so it never ships in a build.
import type { Backup, Entry, Food, Profile, SavedMeal, TableName, Weight } from './db';

export type { Backup, BodyInfo, Entry, Food, Profile, SavedMeal, TableName, Weight } from './db';
export const TABLES: TableName[] = ['Food', 'Entry', 'SavedMeal', 'Profile', 'Weight'];

type Row = Record<string, unknown> & { id: string };
const KEY = 'food-tracker-test-data';
const load = (): Record<TableName, Row[]> => {
  const empty = Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Record<TableName, Row[]>;
  try { return { ...empty, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; }
  catch { return empty; }
};
let db = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
// Same as the real layer: units / items may arrive as JSON strings.
const clean = (r: object): Row => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, (k === 'units' || k === 'items') && typeof v === 'string' ? JSON.parse(v) : v])) as Row;

function model<T>(t: TableName) {
  const create = async (input: object) => {
    const row = { created_at: new Date().toISOString(), ...clean(input), id: (input as Row).id ?? (t === 'Profile' ? 'test-user' : crypto.randomUUID()) };
    db[t].push(row); save();
    return { data: row as unknown as T };
  };
  return {
    list: async () => ({ data: [...db[t]] as unknown as T[] }), // a copy, like the real layer: callers add to their own list
    create,
    update: async (input: object) => {
      const r = clean(input), i = db[t].findIndex((x) => x.id === r.id);
      if (i < 0) return create(r);
      db[t][i] = { ...db[t][i], ...r }; save();
      return { data: db[t][i] as unknown as T };
    },
    delete: async ({ id }: { id: string }) => { db[t] = db[t].filter((x) => x.id !== id); save(); return { data: null }; },
  };
}

export const client = {
  models: { Food: model<Food>('Food'), Entry: model<Entry>('Entry'), SavedMeal: model<SavedMeal>('SavedMeal'), Profile: model<Profile>('Profile'), Weight: model<Weight>('Weight') },
};
export const listEntries = async (from: string, to: string) => (db.Entry as unknown as Entry[]).filter((e) => e.date >= from && e.date <= to);
export const exportAll = async (): Promise<Backup> => structuredClone(db) as unknown as Backup;
export async function restoreAll(b: unknown) { db = { ...load(), ...(b as object) }; save(); }
// Everything is local here, so there is never anything waiting to be sent.
export const setOfflineUser = (_id: string) => {};
export const syncPending = async () => {};
export const hasPending = () => false;

// A signed-in "test user", and a photo reader that answers with a fixed sample instead of calling Claude:
// a meal, or for `mode: 'label'` a multivitamin's label (per tablet, with vitamins beyond the four columns in `extra`).
// A note or description that mentions soup gets a corn soup with a question; picking it (`mode: 'pick'`) finds no
// database food for it, so it comes back as ingredients. "סלט עוף" asks which salad and comes back as that one's
// ingredients; "סלט ירקות" comes with a guessed oil and asks how much ("בלי" drops it). Every other item gets the
// search's first candidate.
const session = { user: { id: 'test-user', email: 'מצב בדיקה' } };
// Meal photos live in localStorage too (path → data URL), so they outlast a restore's reload. `list` gives one
// level down, files or folders, like Storage.
const PHOTOS = 'food-tracker-test-photos';
const files: Record<string, string> = (() => { try { return JSON.parse(localStorage.getItem(PHOTOS) ?? '{}'); } catch { return {}; } })();
const saveFiles = () => localStorage.setItem(PHOTOS, JSON.stringify(files));
const dataUrl = (b: Blob) => new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result as string); r.readAsDataURL(b); });
const bucket = {
  upload: async (path: string, blob: Blob) => { files[path] = await dataUrl(blob); saveFiles(); return { error: null }; },
  list: async (dir: string) => ({
    data: [...new Set(Object.keys(files).filter((p) => p.startsWith(dir + '/')).map((p) => p.slice(dir.length + 1).split('/')[0]))].map((name) => ({ name })),
    error: null,
  }),
  download: async (path: string) => ({ data: await (await fetch(files[path])).blob(), error: null }),
  createSignedUrls: async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: files[path] ?? null })), error: null }),
  move: async (from: string, to: string) => { files[to] = files[from]; delete files[from]; saveFiles(); return { error: null }; },
  remove: async (paths: string[]) => { paths.forEach((p) => delete files[p]); saveFiles(); return { error: null }; },
};
export const supabase = {
  storage: { from: (_bucket: string) => bucket },
  auth: {
    getSession: async () => ({ data: { session } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithOtp: async () => ({ error: null }),
    signOut: async () => { if (confirm('למחוק את כל נתוני הבדיקה?')) { localStorage.removeItem(KEY); localStorage.removeItem(PHOTOS); location.reload(); } },
  },
  functions: {
    invoke: async <D,>(_name: string, opts: { body?: Demo }): Promise<{ data: D; error: null }> => {
      await new Promise((r) => setTimeout(r, 800));
      return { data: demoAnswer(opts.body ?? {}) as D, error: null };
    },
  },
};

type Demo = { mode?: string; note?: string; items?: { name: string; qty: number; unit: string; grams?: number; answers?: string[]; candidates: { id: string }[] }[] };
function demoAnswer({ mode, note = '', items = [] }: Demo) {
  if (mode === 'label')
    return {
      label: {
        name: 'מולטי ויטמין', kcal: 0, carbs: 0, fat: 0, protein: 0, sodium: null, calcium: 200, potassium: null, b12: 6,
        extra: { 'ויטמין D (מק״ג)': 25, 'ויטמין C (מ״ג)': 80, 'ברזל (מ״ג)': 14, 'אבץ (מ״ג)': 10 },
        unit: { n: 'טבליה', g: 1 }, perServing: true, basisG: 1,
      },
    };
  if (mode === 'pick')
    return {
      items: items.map((i) => {
        const said = (i.answers ?? []).join(' ');
        const dish = (parts: { name: string; qty: number; unit: string; grams: number }[]) => ({ id: null, qty: i.qty, unit: i.unit, grams: i.grams, parts });
        if (i.name === SOUP.name) return dish([{ name: 'תירס גרעינים', qty: 120, unit: 'גרם', grams: 120 }, { name: 'שמנת מתוקה', qty: 3, unit: 'כף', grams: 45 }, { name: 'סוכר', qty: 1, unit: 'כפית', grams: 5 }]);
        if (i.name === 'סלט עוף') return dish(said.includes('ירוק')
          ? [{ name: 'חסה', qty: 60, unit: 'גרם', grams: 60 }, { name: 'חזה עוף', qty: 100, unit: 'גרם', grams: 100 }, { name: 'שמן זית', qty: 1, unit: 'כף', grams: 10 }]
          : [{ name: 'חזה עוף', qty: 100, unit: 'גרם', grams: 100 }, { name: 'מיונז', qty: 2, unit: 'כף', grams: 30 }]);
        return { id: i.candidates[0]?.id ?? null, qty: said.includes('בלי') ? 0 : i.qty, unit: i.unit, grams: i.grams, parts: [] };
      }),
    };
  if (note.includes('מרק')) return { items: [SOUP], questions: [{ item: 0, text: 'איך היה המרק?', options: ['סמיך ושמנתי', 'צלול'] }] };
  if (note.includes('סלט עוף')) return { items: [{ name: 'סלט עוף', qty: 1, unit: 'מנה', grams: 200 }], questions: [{ item: 0, text: 'איזה סלט עוף?', options: ['סלט עוף עם מיונז', 'סלט ירוק עם עוף'] }] };
  if (note.includes('סלט ירקות')) return { items: [{ name: 'סלט ירקות', qty: 2, unit: 'כוס', grams: 300 }, { name: 'שמן זית', qty: 1, unit: 'כף', grams: 10, hidden: true }], questions: [{ item: 1, text: 'שמן או רוטב על הסלט?', options: ['בלי', 'כפית', 'כף'] }] };
  return { items: [{ name: 'יוגורט', qty: 1, unit: 'גביע', grams: 150 }, { name: 'ענבים', qty: 10, unit: 'יחידה', grams: 60 }, { name: 'חמאת בוטנים', qty: 1, unit: 'כפית', grams: 10 }, { name: 'גרנולה', qty: 2, unit: 'כף', grams: 20 }, { name: 'שמן זית', qty: 1, unit: 'כף', grams: 10, hidden: true }], questions: [] };
}
const SOUP = { name: 'מרק תירס', qty: 1, unit: 'כוס', grams: 300, about: 'מתוק, בסגנון מסעדת סושי' };

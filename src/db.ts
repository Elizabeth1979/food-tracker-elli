// Supabase data store. Every row belongs to the signed-in user: RLS on each table allows only
// rows where user_id (profiles: id) = auth.uid(), and inserts default those columns to auth.uid().
// `client.models.X` keeps the small list/create/update/delete surface the app was written against.
import { createClient, type PostgrestError } from '@supabase/supabase-js';
import type { MealKey } from './lib';
import { store } from './store';

type Micros = { sodium?: number | null; calcium?: number | null; potassium?: number | null; b12?: number | null };
// extra: other vitamins and minerals by name with unit, { "ויטמין D (מק״ג)": 25 } (see VITAMINS in lib.ts)
type Nutrients = { kcal: number; carbs: number; fat: number; protein: number; extra?: Record<string, number> | null } & Micros;

// Nutrients are per `servingG` grams. units: [{ n: name, g: grams }] (array or JSON string)
export type Food = Nutrients & { id: string; name: string; nameEn?: string | null; source?: string | null; hidden?: boolean | null; servingG: number; units?: unknown };
// One logged item. Nutrients are totals for the logged amount (snapshot). date: YYYY-MM-DD local.
// created_at: when it was logged, set by the database (none yet while it waits to be sent).
export type Entry = Nutrients & { id: string; date: string; meal: MealKey; foodId?: string | null; name: string; grams: number; qty?: number | null; unit?: string | null; created_at?: string | null };
// items: Item[] (older backups hold a JSON string)
export type SavedMeal = { id: string; name: string; items: unknown };
// One row per user; id is the user's id.
// body: what the goals are worked out from (weight comes from the weight log).
export type BodyInfo = { sex: 'f' | 'm'; birthYear: number; heightCm: number; activity: number; aim: number; carbsMax?: number };
export type Profile = { id: string; kcal?: number | null; carbs?: number | null; fat?: number | null; protein?: number | null; recent?: string[] | null; body?: BodyInfo | null; quick?: string[] | null };
// One weigh-in; one per day (a second one that day replaces it). date: YYYY-MM-DD local; waist in cm, optional
export type Weight = { id: string; date: string; kg: number; waist?: number | null };

type Tables = { Food: Food; Entry: Entry; SavedMeal: SavedMeal; Profile: Profile; Weight: Weight };
export type TableName = keyof Tables;
export const TABLES: TableName[] = ['Food', 'Entry', 'SavedMeal', 'Profile', 'Weight'];
export type Backup = { [K in TableName]: Tables[K][] };
type Res<T> = { data: T; errors?: { message: string }[] };

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY (see .env.example)');
// Implicit flow: the magic link carries the session itself, so it works in whichever browser opens it.
export const supabase = createClient(url, key, { auth: { flowType: 'implicit' } });

const TABLE: Record<TableName, string> = { Food: 'foods', Entry: 'entries', SavedMeal: 'saved_meals', Profile: 'profiles', Weight: 'weights' };
const NUTS = ['kcal', 'carbs', 'fat', 'protein', 'sodium', 'calcium', 'potassium', 'b12', 'extra'];
// The columns the app writes. Rows from the UI or a backup can carry extras (user_id, created_at, Amplify's owner…).
const COLS: Record<TableName, string[]> = {
  Food: ['id', 'name', 'nameEn', 'source', 'hidden', 'servingG', 'units', ...NUTS],
  Entry: ['id', 'date', 'meal', 'foodId', 'name', 'grams', 'qty', 'unit', ...NUTS],
  SavedMeal: ['id', 'name', 'items'],
  Profile: ['id', 'kcal', 'carbs', 'fat', 'protein', 'recent', 'body', 'quick'],
  Weight: ['id', 'date', 'kg', 'waist'],
};
const JSON_COLS = new Set(['units', 'items', 'body', 'extra']);
// Foods are keyed per user, so a user can override a shipped MoH food under its own id.
const CONFLICT: Record<TableName, string> = { Food: 'user_id,id', Entry: 'id', SavedMeal: 'id', Profile: 'id', Weight: 'id' };
// Entries keep the order they were logged in, weights go by date; the rest sort by name.
const ORDER: Record<TableName, string> = { Food: 'name', Entry: 'created_at', SavedMeal: 'name', Profile: 'id', Weight: 'date' };

const clean = (t: TableName, row: object) => {
  const r = row as Record<string, unknown>;
  return Object.fromEntries(
    COLS[t].filter((c) => r[c] !== undefined).map((c) => [c, JSON_COLS.has(c) && typeof r[c] === 'string' ? JSON.parse(r[c] as string) : r[c]]),
  );
};

// ---------- offline ----------
// With no connection the app still opens and logging still works. Each list is kept on the device when it
// loads (entries from the last KEEP_DAYS days), and changes made offline wait in order in `pending` until
// syncPending sends them. What the app shows = the kept copy with the pending changes on top.
type Row = Record<string, unknown> & { id: string };
type Op = { t: TableName; op: 'create' | 'update' | 'delete'; row: Row };
const KEEP_DAYS = 92;
// Kept per user, so another account on this device never sees or sends them.
let uid = '';
export const setOfflineUser = (id: string) => { uid = id; };
const kept = <T,>(k: string, d: T) => store.get<T>(`offline:${uid}:${k}`, d);
const keep = (k: string, v: unknown) => store.set(`offline:${uid}:${k}`, v);
const pending = () => kept<Op[]>('pending', []);
// The app shows a "waiting to send" line while anything is queued; it listens for this event.
const setPending = (ops: Op[]) => { keep('pending', ops); window.dispatchEvent(new Event('pending-changed')); };
export const hasPending = () => pending().length > 0;

class Offline extends Error { constructor() { super('אין חיבור לאינטרנט'); } }
// Status 0: the request got no answer. Anything Supabase answered and refused is a real error and throws as before.
// Offline it isn't even tried: an expired sign-in would first spend ~25 s retrying its refresh.
async function send<T>(q: () => PromiseLike<{ data: T; error: PostgrestError | null; status: number }>): Promise<T> {
  if (!navigator.onLine) throw new Offline();
  const { data, error, status } = await q();
  if (status === 0) throw new Offline();
  if (error) throw error;
  return data;
}

// Applies changes to a list of rows. `inList` drops rows that don't belong (an entry moved to another day).
function apply<T extends { id: string }>(rows: T[], ops: Op[], inList: (r: T) => boolean = () => true): T[] {
  return ops.reduce((xs, { op, row }) => {
    const old = xs.find((x) => x.id === row.id);
    const next = { ...old, ...row } as T;
    if (op === 'delete' || !inList(next)) return xs.filter((x) => x.id !== row.id);
    return old ? xs.map((x) => (x === old ? next : x)) : [...xs, next];
  }, rows);
}
const cacheKey = (t: TableName) => (t === 'Entry' ? 'entries' : t);
// A change Supabase now has: put it in the kept copy too, so it's there next time the app is offline.
const remember = (o: Op) => {
  const rows = kept<Row[] | null>(cacheKey(o.t), null);
  if (rows) keep(cacheKey(o.t), apply(rows, [o]));
};
const local = <T extends { id: string }>(t: TableName, rows: T[], inList?: (r: T) => boolean) => apply(rows, pending().filter((o) => o.t === t), inList);

type Page<T> = PromiseLike<{ data: T[] | null; error: PostgrestError | null; status: number }>;
const PAGE = 1000; // PostgREST's default row cap per request
async function fetchAll<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const data = await send(() => page(from, from + PAGE - 1));
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}
const listAll = <K extends TableName>(t: K) =>
  fetchAll<Tables[K]>((a, b) => supabase.from(TABLE[t]).select('*').order(ORDER[t]).order('id').range(a, b));
// Fresh rows are kept; offline the kept copy stands in (none kept yet: the error shows as before).
async function cached<T>(load: () => Promise<T>, fallback: () => T | null): Promise<T> {
  try { return await load(); } catch (e) {
    const old = e instanceof Offline ? fallback() : null;
    if (old == null) throw e;
    return old;
  }
}

// Straight to Supabase. Failures throw (the app shows them in its error banner) instead of handing callers a null row.
function remote<K extends TableName>(t: K) {
  type T = Tables[K];
  const create = async (input: Row) => (await send(() => supabase.from(TABLE[t]).insert(clean(t, input)).select().single())) as T;
  return {
    create,
    // Updates the row, or creates it when there is none yet: that is how a MoH food gets its first
    // local override (an edit, or hidden: true), so callers pass the whole food in that case.
    update: async (input: Row): Promise<T> => {
      const { id: _, ...patch } = clean(t, input);
      const data = await send(() => supabase.from(TABLE[t]).update(patch).eq('id', input.id).select());
      return data?.length ? (data[0] as T) : create(input);
    },
    delete: async ({ id }: Row) => { await send(() => supabase.from(TABLE[t]).delete().eq('id', id)); return null; },
  };
}

function model<K extends TableName>(t: K) {
  type T = Tables[K];
  const server = remote(t);
  // Ids are made here, so a row logged offline keeps the same id once it reaches Supabase. A profile's id is the user's.
  const write = <R,>(op: Op['op']) => async (input: object): Promise<Res<R>> => {
    const row = { ...input, id: (input as Row).id ?? (t === 'Profile' ? uid : crypto.randomUUID()) } as Row;
    // While older changes still wait, newer ones queue behind them, so they reach Supabase in order.
    if (!pending().length) {
      try {
        const data = await server[op](row);
        remember({ t, op, row: (data as Row | null) ?? row });
        return { data: data as R };
      } catch (e) { if (!(e instanceof Offline)) throw e; }
    }
    const before = local<Row>(t, kept<Row[]>(cacheKey(t), [])).find((r) => r.id === row.id);
    setPending([...pending(), { t, op, row }]);
    void syncPending();
    return { data: (op === 'delete' ? null : { ...before, ...row }) as R };
  };
  return {
    list: async (): Promise<Res<T[]>> => ({
      data: local(t, await cached(async () => { const rows = await listAll(t); keep(cacheKey(t), rows); return rows; }, () => kept<T[] | null>(cacheKey(t), null))),
    }),
    create: write<T>('create') as (input: Omit<T, 'id'> & { id?: string }) => Promise<Res<T>>,
    update: write<T>('update') as (input: Partial<T> & { id: string }) => Promise<Res<T>>,
    delete: write<null>('delete') as (input: { id: string }) => Promise<Res<null>>,
  };
}

export const client = {
  models: { Food: model('Food'), Entry: model('Entry'), SavedMeal: model('SavedMeal'), Profile: model('Profile'), Weight: model('Weight') },
};

// Entries of the last KEEP_DAYS days are kept, whichever range loaded them.
export async function listEntries(from: string, to: string): Promise<Entry[]> {
  const inRange = (e: Entry) => e.date >= from && e.date <= to;
  const rows = await cached(async () => {
    const fresh = await fetchAll<Entry>((a, b) => supabase.from('entries').select('*').gte('date', from).lte('date', to).order('created_at').order('id').range(a, b));
    const since = new Date(Date.now() - KEEP_DAYS * 864e5).toLocaleDateString('en-CA');
    keep('entries', [...kept<Entry[]>('entries', []).filter((e) => !inRange(e) && e.date >= since), ...fresh.filter((e) => e.date >= since)]);
    return fresh;
  }, () => kept<Entry[]>('entries', []).filter(inRange));
  return local('Entry', rows, inRange);
}

// Sends the waiting changes in order; stops while still offline. A change Supabase refuses stays queued and the
// error shows in the banner, so nothing logged is ever dropped. A create that already arrived (23505) counts as sent.
let syncing: Promise<void> | undefined;
export const syncPending = (): Promise<void> =>
  (syncing ??= (async () => {
    for (let o: Op | undefined; (o = pending()[0]); ) {
      try { remember({ ...o, row: ((await remote(o.t)[o.op](o.row)) as Row | null) ?? o.row }); }
      catch (e) {
        if (e instanceof Offline) return;
        if ((e as PostgrestError).code !== '23505') throw e;
      }
      setPending(pending().slice(1));
    }
  })().finally(() => { syncing = undefined; }));

// Same shape as the local-only app's backups, so files move freely between the two.
export const exportAll = async (): Promise<Backup> =>
  Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, (await listAll(t)).map((r) => clean(t, r))]))) as Backup;

const chunks = <T,>(xs: T[], n = 500) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

// Replaces all of the user's data with the backup. Throws on a file that isn't a backup, before touching anything.
// Upserts first and deletes leftovers last, so a failure part-way never loses rows that were in the backup.
// `moh` completes partial MoH overrides from local-only backups (e.g. just { id, hidden: true }).
export async function restoreAll(b: unknown, moh: Food[]) {
  const data = b as Partial<Backup> | null;
  if (!data || typeof data !== 'object' || !TABLES.some((t) => Array.isArray(data[t])) || TABLES.some((t) => data[t] != null && !Array.isArray(data[t])))
    throw new Error('זה לא קובץ גיבוי');
  const base = new Map(moh.map((f) => [f.id, f]));
  const source: { [K in TableName]: object[] } = {
    Food: (data.Food ?? []).map((f) => ({ ...base.get(f.id), ...f })),
    Entry: data.Entry ?? [],
    SavedMeal: data.SavedMeal ?? [],
    // A backup's profile id belongs to whoever made it; the row here is always the signed-in user's.
    Profile: (data.Profile ?? []).slice(0, 1).map(({ id: _, ...p }) => p),
    Weight: data.Weight ?? [],
  };
  for (const t of TABLES) {
    const rows = source[t].map((r) => clean(t, r));
    for (const c of chunks(rows)) {
      const { error } = await supabase.from(TABLE[t]).upsert(c, { onConflict: CONFLICT[t] });
      if (error) throw error;
    }
    if (t === 'Profile') continue;
    const keep = new Set(rows.map((r) => r.id));
    const stale = (await listAll(t)).map((r) => r.id).filter((id) => !keep.has(id));
    for (const c of chunks(stale)) {
      const { error } = await supabase.from(TABLE[t]).delete().in('id', c);
      if (error) throw error;
    }
  }
}

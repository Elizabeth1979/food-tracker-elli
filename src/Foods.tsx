import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Ctx } from './App';
import { MEALS, VITAMINS, head, addEntries, client, fmtDate, json, kcalOff, labelPhotoUrl, mealItems, mealNow, readLabel, sameFood, saveLabelPhoto, searchFoods, sum, today, type Entry, type Extra, type Food, type Item, type Label, type SavedMeal, type Unit } from './lib';
import { Group, FoodSummary, MINE_HINT, MicroLine, Modal, PhotoPick, confirmIt, UNIT_HINT, UnitInputs, draftOf, unitOf, type UnitDraft } from './ui';
import { MealEditor } from './MealEditor';
import { AddDialog } from './AddDialog';
import { Icon } from './icons';

const FIELDS = [
  ['kcal', 'קלוריות', true], ['carbs', 'פחמימות (ג׳)', true], ['fat', 'שומן (ג׳)', true], ['protein', 'חלבון (ג׳)', true],
  ['sodium', 'נתרן (מ״ג)', false], ['calcium', 'סידן (מ״ג)', false], ['potassium', 'אשלגן (מ״ג)', false], ['b12', 'B12 (מק״ג)', false],
] as const;

// A read nutrition label as a food of your own: values per 100 g (per piece for a supplement), the serving as a unit.
export const labelFood = (l: Label): Partial<Food> => ({
  name: l.name, servingG: l.basisG, kcal: l.kcal, carbs: l.carbs, fat: l.fat, protein: l.protein,
  sodium: l.sodium, calcium: l.calcium, potassium: l.potassium, b12: l.b12, extra: l.extra ?? null,
  units: JSON.stringify(l.unit ? [l.unit] : []),
});

// Saves a food of your own. A likely duplicate, or calories that don't fit the macros (a misread label), asks first;
// null when the user goes back to fix it. The label photo the values were read from is kept with the food.
export async function saveFood(foods: Food[], f: Partial<Food>, scan?: File | null): Promise<Food | null> {
  const dup = sameFood(foods, f), est = kcalOff(f);
  const why = [dup && `כבר יש לך ״${dup.name}״.`, est != null && `${f.kcal} קלוריות לא מתאימות לחלבון, לפחמימות ולשומן, שנותנים בערך ${est}. אולי הטבלה נקראה לא נכון.`];
  if ((dup || est != null) && !(await confirmIt('לשמור בכל זאת?', 'שמור בכל זאת', why.filter(Boolean).join(' ')))) return null;
  const row = { ...f, source: 'user' }; // app edits win over the shipped food files
  const { data, errors } = f.id ? await client.models.Food.update(row as Food) : await client.models.Food.create(row as Food);
  if (errors) throw new Error(errors[0].message);
  if (scan) saveLabelPhoto(scan, data!.id).catch(console.error);
  return data!;
}

export function FoodForm({ foods, init, scan: scanned, onSaved }: { foods: Food[]; init: Partial<Food>; scan?: File | null; onSaved: (f: Food) => void }) {
  const [v, setV] = useState<Record<string, string>>(() =>
    Object.fromEntries(['name', 'servingG', ...FIELDS.map((f) => f[0])].map((k) => [k, String((init as any)[k] ?? (k === 'servingG' ? 100 : ''))])));
  const [units, setUnits] = useState<UnitDraft[]>(() => json<Unit[]>(init.units, []).map(draftOf));
  // Other vitamins and minerals, by name with unit; an emptied field is dropped on save.
  const [extra, setExtra] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(json<Extra>(init.extra, {}) ?? {}).map(([k, x]) => [k, String(x)])));
  const [err, setErr] = useState('');
  const [filled, setFilled] = useState(''); // how the photo filled the form, said once it has
  const [reading, setReading] = useState<File | null>(null); // the label photo being read
  const [scan, setScan] = useState(scanned ?? null); // the label photo read, saved with the food
  const [shot, setShot] = useState<string | null>(null); // the one saved before, to check the values against
  useEffect(() => { if (init.id) labelPhotoUrl(init.id).then(setShot, () => {}); }, [init.id]);
  const num = (k: string) => (v[k] === '' ? null : Number(v[k]));
  // Supplements (creatine, vitamins): no energy or macros, logged by the serving.
  // With nothing to scale, the serving is just the scoop: 5 g unless one was typed over the 100 g default.
  const supplement = () => {
    const g = v.servingG === '100' || !Number(v.servingG) ? '5' : v.servingG;
    setV({ ...v, servingG: g, kcal: '0', carbs: '0', fat: '0', protein: '0' });
    if (!units.some((u) => u.n)) setUnits([{ k: '1', n: 'מנה', g }]);
  };
  // Fills the form from a photo of the package's nutrition table; everything stays editable until שמור.
  const photo = async (file: File) => {
    setErr(''); setReading(file);
    try {
      const l = await readLabel(file);
      const f = labelFood(l);
      const vals = Object.fromEntries(FIELDS.map(([k]) => [k, f[k] == null ? '' : String(f[k])]));
      setV((v) => ({ ...v, ...vals, name: v.name.trim() || l.name, servingG: String(l.basisG) }));
      setExtra((x) => ({ ...x, ...Object.fromEntries(Object.entries(l.extra ?? {}).map(([k, n]) => [k, String(n)])) }));
      if (l.unit) setUnits((us) => [...us.filter((u) => u.n && u.n !== l.unit!.n), draftOf(l.unit!)]);
      setScan(file);
      setFilled(l.basisG !== 100 && l.unit ? `הערכים מולאו מהתמונה, ל${l.unit.n} אחת` : l.perServing ? 'הערכים מולאו מהתמונה וחושבו ל־100 גרם לפי משקל המנה' : 'הערכים מולאו מהתמונה');
    } catch (x: any) { setErr(x.message); setFilled(''); } finally { setReading(null); }
  };
  const save = async () => {
    if (!v.name.trim() || FIELDS.some(([k, , req]) => req && num(k) == null)) return setErr('יש למלא שם, קלוריות ומקרו־נוטריינטים');
    const kept = Object.entries(extra).filter(([, x]) => x !== '').map(([k, x]) => [k, Number(x)]);
    const input = {
      id: init.id, name: v.name.trim(), servingG: num('servingG') || 100,
      kcal: num('kcal')!, carbs: num('carbs')!, fat: num('fat')!, protein: num('protein')!, sodium: num('sodium'), calcium: num('calcium'), potassium: num('potassium'), b12: num('b12'),
      extra: kept.length ? Object.fromEntries(kept) : null,
      units: JSON.stringify(units.map(unitOf).filter((u) => u.n && u.g > 0)),
    };
    try { const f = await saveFood(foods, input, scan); if (f) onSaved(f); } catch (x: any) { setErr(x.message); }
  };
  const inp = (k: string, label: string) => (
    <label key={k}><span>{label}</span><input type={k === 'name' ? 'text' : 'number'} inputMode={k === 'name' ? 'text' : 'decimal'} step="any" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>
  );
  return (
    <div className="form">
      <PhotoPick camera="צילום טבלת ערכים" gallery="טבלה מהגלריה" reading={reading} busyText="קורא את הטבלה…" onFile={photo} />
      {filled && <p className="muted small" role="status">{filled}. כדאי לבדוק אותם מול האריזה לפני השמירה.</p>}
      {shot && <details><summary>הטבלה שנסרקה</summary><img src={shot} alt={`טבלת הערכים של ${init.name}`} /></details>}
      {inp('name', 'שם')}
      {inp('servingG', 'הערכים הם עבור (גרם)')}
      <button className="link start" onClick={supplement}><Icon name="pill" />תוסף תזונה / ללא קלוריות: מלא אפסים</button>
      <div className="grid2">
        {FIELDS.map(([k, l]) => inp(k, l))}
        {Object.keys(extra).map((k) => (
          <label key={k}><span>{k}</span><input type="number" inputMode="decimal" step="any" value={extra[k]} onChange={(e) => setExtra({ ...extra, [k]: e.target.value })} /></label>
        ))}
      </div>
      <label>
        <span>ויטמין או מינרל נוסף</span>
        <select value="" onChange={(e) => e.target.value && setExtra({ ...extra, [e.target.value]: '' })}>
          <option value="">בחרו להוספה…</option>
          {VITAMINS.filter((n) => !(n in extra)).map((n) => <option key={n}>{n}</option>)}
        </select>
      </label>
      <h4>יחידות (אופציונלי)</h4>
      <p className="muted small">{UNIT_HINT}</p>
      {units.map((u, i) => (
        <div key={i} className="unit-row">
          <UnitInputs d={u} set={(d) => setUnits(units.map((x, j) => (j === i ? d : x)))} />
          <button className="icon" aria-label="מחק יחידה" onClick={() => setUnits(units.filter((_, j) => j !== i))}><Icon name="x" /></button>
        </div>
      ))}
      <button className="link" onClick={() => setUnits([...units, { k: '1', n: '', g: '' }])}><Icon name="plus" />הוסף יחידה</button>
      {err && <p className="error">{err}</p>}
      <button className="btn primary" onClick={save}>שמור</button>
    </div>
  );
}

export default function Foods({ ctx, date }: { ctx: Ctx; date: string }) {
  const [q, setQ] = useState('');
  const [logging, setLogging] = useState<Food | null>(null);
  const [msg, setMsg] = useState('');
  const logged = (es: Entry[]) => setMsg(`״${es[0]?.name}״ נוסף ל${MEALS.find((m) => m.key === es[0]?.meal)?.label ?? 'יומן'}`);
  const [edit, setEdit] = useState<Partial<Food> | null>(null);
  const [mealEdit, setMealEdit] = useState<SavedMeal | 'new' | null>(null);
  const hits = useMemo(() => (q ? searchFoods(ctx.foods, q, ctx.recent) : []), [ctx.foods, q, ctx.recent]);
  const saved = (f: Food) => { ctx.setFoods(edit?.id ? ctx.foods.map((x) => (x.id === f.id ? f : x)) : [...ctx.foods, f]); setEdit(null); };
  const hide = async (f: Food) => {
    if (!(await confirmIt(`להסתיר את "${f.name}"?`, 'הסתרה'))) return;
    await client.models.Food.update({ ...f, hidden: true }); // whole food: a MoH food has no row of its own yet
    ctx.setFoods(ctx.foods.map((x) => (x.id === f.id ? { ...x, hidden: true } : x)));
  };
  const delMeal = async (id: string) => {
    if (!(await confirmIt('למחוק את הארוחה השמורה?', 'מחיקה'))) return;
    await client.models.SavedMeal.delete({ id });
    ctx.setMeals(ctx.meals.filter((m) => m.id !== id));
  };
  const mine = ctx.foods.filter((f) => f.source !== 'moh' && !f.hidden);
  // One tap adds a saved meal to the diary's day, at the meal of the time of day; "בטל" takes it back.
  const now = MEALS.find((m) => m.key === mealNow())!.label + (date === today() ? '' : ` · ${fmtDate(date, { day: 'numeric', month: 'short' })}`);
  const [added, setAdded] = useState<{ name: string; es: Entry[] } | null>(null);
  const addMeal = async (m: SavedMeal, items: Item[]) => {
    ctx.addRecent(items.flatMap((i) => (i.foodId ? [i.foodId] : [])));
    const es = await addEntries(date, mealNow(), items);
    setAdded({ name: m.name, es });
    setTimeout(() => setAdded((a) => (a?.es === es ? null : a)), 6000);
  };
  const undoAdd = async () => {
    const es = added!.es;
    setAdded(null);
    await Promise.all(es.map((e) => client.models.Entry.delete({ id: e.id })));
  };
  const foodRow = (f: Food) => (
    <ItemRow key={f.id} name={f.name} mine={f.source !== 'moh'} onAdd={() => setLogging(f)}>
      <FoodSummary f={f} tags={false} />
      <MicroLine n={f} />
      <div className="grid2">
        <button className="btn small" aria-label={`עריכה: ${f.name}`} onClick={() => setEdit(f)}><Icon name="pencil" />עריכה</button>
        <button className="btn small" aria-label={`הסתרה: ${f.name}`} onClick={() => hide(f)}><Icon name="trash" />הסתרה</button>
      </div>
    </ItemRow>
  );
  const mealRow = (m: SavedMeal) => {
    const items = mealItems(ctx.foods, m);
    return (
      <ItemRow key={m.id} name={m.name} onAdd={() => addMeal(m, items)}>
        <small className="muted">{items.map((i) => head(i.name)).join(' · ')} · <b>{sum(items).kcal} קק״ל</b></small>
        <div className="grid2">
          <button className="btn small" aria-label={`עריכה: ${m.name}`} onClick={() => setMealEdit(m)}><Icon name="pencil" />עריכה</button>
          <button className="btn small" aria-label={`מחיקה: ${m.name}`} onClick={() => delMeal(m.id)}><Icon name="trash" />מחיקה</button>
        </div>
      </ItemRow>
    );
  };
  return (
    <div className="stack">
      <h1 className="page-title">מזונות</h1>
      {/* Search first, so typing shows its results right under the box; while searching, only results show */}
      <input className="search" type="search" aria-label="חיפוש במאגר" placeholder={`חיפוש בכל ${ctx.foods.filter((f) => !f.hidden).length} המזונות…`} value={q} onChange={(e) => setQ(e.target.value)} />
      {msg && <button className="banner" onClick={() => setMsg('')}>{msg}</button>}
      {q ? (
        <Group title={`תוצאות (${hits.length})`} action={<button className="btn small primary" onClick={() => setEdit({ name: q })}><Icon name="plus" />מזון חדש</button>}>
          <p className="muted small">הקשה על שם מציגה את הערכים; ＋ מוסיף ליומן. {MINE_HINT}</p>
          <Fold key={q} items={hits} row={foodRow} />
        </Group>
      ) : <>
        <p className="muted small">הקשה על שם מציגה את הפרטים. ＋ ליד מזון בוחר כמות ומוסיף ליומן; ליד ארוחה שמורה מוסיף אותה מיד ל{now}.</p>
        <Group title={`המזונות שלי (${mine.length})`} action={<button className="btn small primary" onClick={() => setEdit({ name: '' })}><Icon name="plus" />מזון חדש</button>}>
          {mine.length ? <Fold items={mine} row={foodRow} /> : <p className="muted">מזונות שתוסיפו או תערכו יופיעו כאן.</p>}
        </Group>
        <Group title={`ארוחות שמורות (${ctx.meals.length})`} action={<button className="btn small primary" onClick={() => setMealEdit('new')}><Icon name="plus" />ארוחה חדשה</button>}>
          {ctx.meals.length ? <Fold items={ctx.meals} row={mealRow} /> : <p className="muted">צרו ארוחה כאן, או שמרו ארוחה מהיומן עם ״שמור כארוחה״.</p>}
        </Group>
        <p className="muted small">שאר המזונות, ממאגר משרד הבריאות, נמצאים בחיפוש.</p>
      </>}
      {added && <div className="toast" role="status">״{added.name}״ נוסף ל{now} <button onClick={undoAdd}>בטל</button></div>}
      {logging && <AddDialog ctx={ctx} meal={mealNow()} date={date} fromFoods initial={logging} onClose={() => setLogging(null)} onAdded={logged} />}
      {mealEdit && <MealEditor ctx={ctx} meal={mealEdit === 'new' ? undefined : mealEdit} onClose={() => setMealEdit(null)} />}
      {edit && <Modal title={edit.id ? 'עריכת מזון' : 'מזון חדש'} onClose={() => setEdit(null)}><FoodForm foods={ctx.foods} init={edit} onSaved={saved} /></Modal>}
    </div>
  );
}

// A list that shows five at a time: "הצג עוד" adds five more, "הצג פחות" folds back.
function Fold<T>({ items, row, step = 5 }: { items: T[]; row: (x: T) => ReactNode; step?: number }) {
  const [n, setN] = useState(step);
  return <>
    {items.slice(0, n).map(row)}
    {n < items.length ? <button className="link" onClick={() => setN(n + step)}>הצג עוד ({items.length - n})</button>
      : items.length > step && <button className="link" onClick={() => setN(step)}>הצג פחות</button>}
  </>;
}

// A row that shows just the name: tapping it opens the details; ＋ adds to the diary.
function ItemRow({ name, mine, onAdd, children }: { name: string; mine?: boolean; onAdd: () => void; children: ReactNode }) {
  return (
    <div className="row static">
      <details className="grow">
        <summary><Icon name="chevron-down" /><span>{name}</span>{mine && <span className="tag">שלי</span>}</summary>
        <div className="form">{children}</div>
      </details>
      <button className="icon" aria-label={`הוסף ליומן: ${name}`} onClick={onAdd}><span className="mark"><Icon name="plus" /></span></button>
    </div>
  );
}

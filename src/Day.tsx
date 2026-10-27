import { useEffect, useRef, useState } from 'react';
import { goalsLeft, goalsOf, type Goals } from './goals';
import type { Ctx } from './App';
import { MEALS, WATER, pickItem, addDays, addEntries, amountLabel, client, deletePhoto, movePhoto, fmtDate, isDish, isWater, listPhotos, loadEntries, mealNow, sum, today, type Entry, type MealKey, type MealPhoto } from './lib';
import { AiTag, DayGoals, GoalsInfo, Group, MicroGoals, Modal, Ring, WaterLine, confirmIt, promptIt } from './ui';
import { AddDialog, EntryDialog, QuickAdd } from './AddDialog';
import { Icon } from './icons';
import { ArticleLink } from './Guide';

export default function Day({ ctx, date, setDate, onExport, onTailor }: { ctx: Ctx; date: string; setDate: (d: string) => void; onExport: () => void; onTailor: () => void }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  // Home-screen shortcuts open straight into the add dialog: /?add=breakfast|lunch|dinner|snack|saved
  const [shortcut] = useState(() => {
    const add = new URLSearchParams(location.search).get('add');
    if (add) history.replaceState(null, '', '/');
    return add;
  });
  const [adding, setAdding] = useState<MealKey | null>(() => (shortcut ? (MEALS.some((m) => m.key === shortcut) ? (shortcut as MealKey) : mealNow()) : null));
  const [fitting, setFitting] = useState<Goals | null>(null); // the ＋ window opened on what fits in what's left
  const [editing, setEditing] = useState<Entry | null>(null);
  const [quick, setQuick] = useState(0); // the quick-add row reloads when the ＋ window closes: it may have added the usual things
  const [msg, setMsg] = useState('');
  // The deleted entry, with its meal's photos when it was the meal's last food (they go with it unless undone).
  const [undo, setUndo] = useState<{ e: Entry; photos: MealPhoto[] } | null>(null);
  const undone = useRef(new Set<string>());
  const [toggled, setToggled] = useState<Record<string, boolean>>({}); // `${date}:${meal}` → open

  // A meal's photos show in its foods' details, not in the list: they'd crowd it and don't sit next to any one food.
  const [photos, setPhotos] = useState<MealPhoto[]>([]);
  const [viewing, setViewing] = useState<MealPhoto | null>(null);

  useEffect(() => {
    setEntries(null);
    loadEntries(date, date).then(setEntries);
    let current = true; // a slow answer for a day already left mustn't show its photos here
    setPhotos([]);
    listPhotos(date).then((ps) => current && setPhotos(ps));
    return () => { current = false; };
  }, [date]);

  const list = entries ?? [];
  const tot = sum(list);
  // Water has its own line in the summary, so the meals list only food.
  const waters = list.filter(isWater), food = list.filter((e) => !isWater(e));
  const drink = async () => {
    const es = await addEntries(date, mealNow(), [WATER]);
    setEntries((cur) => [...(cur ?? []), ...es]);
  };
  const goals = goalsOf(ctx.profile), goal = goals.kcal;
  const left = goalsLeft(goals, tot);

  // Today, meals before the current one start collapsed; a tap on the header overrides.
  const isOpen = (meal: MealKey) => toggled[`${date}:${meal}`] ?? !(date === today() && MEALS.findIndex((m) => m.key === meal) < MEALS.findIndex((m) => m.key === mealNow()));
  const setOpen = (meal: string, open: boolean) => setToggled((t) => ({ ...t, [`${date}:${meal}`]: open }));
  const added = (es: Entry[]) => {
    setEntries((cur) => [...(cur ?? []), ...es]);
    if (es[0]) setOpen(es[0].meal, true);
  };
  // A meal's photos belong to its food: they go (or move) with the meal's last food.
  const photosLeft = (e: Entry) => (!isWater(e) && !food.some((x) => x.meal === e.meal && x.id !== e.id) ? photos.filter((p) => p.meal === e.meal) : []);
  const remove = async (e: Entry) => {
    await client.models.Entry.delete({ id: e.id });
    setEntries((cur) => cur!.filter((x) => x.id !== e.id));
    const ps = photosLeft(e);
    setPhotos((cur) => cur.filter((p) => !ps.includes(p)));
    setUndo({ e, photos: ps });
    setTimeout(() => {
      setUndo((u) => (u?.e.id === e.id ? null : u));
      if (!undone.current.delete(e.id)) ps.forEach((p) => void deletePhoto(p));
    }, 6000);
  };
  const restore = async ({ e, photos: ps }: { e: Entry; photos: MealPhoto[] }) => {
    undone.current.add(e.id);
    setUndo(null);
    setPhotos((cur) => [...cur, ...ps]);
    added(await addEntries(e.date, e.meal as MealKey, [pickItem(e)]));
  };
  const saved = async (old: Entry, e: Entry) => {
    setEntries((cur) => cur!.map((x) => (x.id === e.id ? e : x)));
    setEditing(null);
    const ps = e.meal === old.meal ? [] : photosLeft(old);
    if (!ps.length) return;
    const moved = await Promise.all(ps.map((p) => movePhoto(p, e.meal as MealKey)));
    setPhotos((cur) => [...cur.filter((p) => !ps.includes(p)), ...moved]);
  };
  const removePhoto = async (p: MealPhoto) => {
    if (!(await confirmIt('למחוק את התמונה?', 'מחק תמונה'))) return;
    await deletePhoto(p);
    setPhotos((cur) => cur.filter((x) => x.path !== p.path));
    setViewing(null);
  };
  const saveMeal = async (meal: MealKey) => {
    const items = food.filter((e) => e.meal === meal).map(pickItem);
    const name = items.length && (await promptIt('שמירה כארוחה', 'שם הארוחה', 'שמור'));
    if (!name) return;
    const { data } = await client.models.SavedMeal.create({ name, items: JSON.stringify(items) });
    ctx.setMeals([...ctx.meals, data!]);
    setMsg(`"${name}" נשמרה`);
  };

  return (
    <div className="day">
      <header className="datebar">
        <button className="icon" onClick={() => setDate(addDays(date, -1))} aria-label="יום קודם"><Icon name="chevron-right" /></button>
        <label className="date-pick">
          <b>{date === today() ? 'היום' : fmtDate(date, { weekday: 'long' })}</b>
          <span className="muted">{fmtDate(date, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <button className="icon" onClick={() => setDate(addDays(date, 1))} aria-label="יום הבא"><Icon name="chevron-left" /></button>
        {date !== today() && <button className="btn small" onClick={() => setDate(today())}>להיום</button>}
      </header>

      <section className="card pad stack" aria-label="סיכום היום">
        {/* One way in, first thing on the screen: the meal starts at the time of day's and is one tap to change in the window */}
        <div className="summary-top">
          <Ring value={tot.kcal} goal={goal} size={140} center={<><b>{goal ? Math.abs(Math.round(goal - tot.kcal)) : tot.kcal}</b><small>{goal ? (goal - tot.kcal >= 0 ? 'נותרו' : 'חריגה') : 'קלוריות'}</small></>} />
          <button className="btn primary" onClick={() => setAdding(mealNow())}><Icon name="plus" />הוספה</button>
        </div>
        {/* The owner's order: what she adds first (water, then the quick add), then what the day gave (macros, vitamins) */}
        <WaterLine ml={waters.reduce((t, e) => t + e.grams, 0)} onAdd={drink} onRemove={waters.length ? () => remove(waters.at(-1)!) : undefined} />
        {date === today() && <QuickAdd key={quick} ctx={ctx} date={date} onAdded={added} onRemoved={(es) => setEntries((cur) => cur!.filter((x) => !es.some((e) => e.id === x.id)))} />}
        {/* Only today, and only while there's room left: "what can I still eat?" from the usual things */}
        {date === today() && entries && left.kcal > 0 && <button className="link start" onClick={() => { setFitting(left); setAdding(mealNow()); }}><Icon name="apple" />מה נכנס ב־{Math.round(left.kcal)} קק״ל?</button>}
        <div>
          <div className="kcal-line"><span>נצרכו</span><b>{tot.kcal}</b><span className="muted">מתוך {goal} קק״ל</span></div>
          <DayGoals n={tot} goals={goals} />
        </div>
        {/* The day's vitamins and minerals, from food and supplements, folded: a row each would crowd the summary */}
        <details aria-label="ויטמינים ומינרלים שצרכת היום">
          <summary><Icon name="chevron-down" />ויטמינים ומינרלים שצרכת היום</summary>
          <p className="muted small">כל מה שרשמת היום, אוכל ותוספים, מול הערך היומי שעל תוויות המזון. ערכי המזון ממאגר משרד הבריאות; ביוטין ויוד רק מתוספים ומתוויות שצילמת. נגיעה בשורה מראה ממה הגיע, למה זה חשוב ואיך נקבע היעד.</p>
          <MicroGoals n={tot} from={{ items: list, when: date === today() ? 'היום' : 'ביום הזה' }} more={<ArticleLink slug="6-vitamins">עוד על הערך היומי</ArticleLink>} />
          <ArticleLink slug="6-vitamins">מה זה ערך יומי?</ArticleLink>
        </details>
        {!ctx.profile?.body && <p className="muted small">יעדים כלליים, לא מותאמים לגוף שלך. <button className="link" onClick={onTailor}>התאמה אישית</button></p>}
        <GoalsInfo goals={goals} more={<><ArticleLink slug="3-protein">עוד על חלבון</ArticleLink><ArticleLink slug="7-carbs">עוד על פחמימות וקטו</ArticleLink></>} />
      </section>

      {msg && <div className="banner" onClick={() => setMsg('')}>{msg}</div>}
      {undo && <div className="toast" role="status">״{undo.e.name}״ נמחק{undo.photos.length > 1 ? ' עם תמונות הארוחה' : undo.photos.length ? ' עם תמונת הארוחה' : ''} <button onClick={() => restore(undo)}>בטל</button></div>}
      {entries === null && <div className="muted center">טוען…</div>}

      <Group title="ארוחות" body="">
      {MEALS.map((m) => {
        const es = food.filter((e) => e.meal === m.key);
        const open = isOpen(m.key);
        return (
          <section key={m.key} className="meal" aria-label={m.label}>
            <header>
              <h3 className="grow">
                <button className="meal-toggle" aria-expanded={open} aria-controls={`meal-${m.key}`} onClick={() => setOpen(m.key, !open)}>
                  <span className="meal-icon"><Icon name={m.icon} /></span>{m.label}<span className="grow" />
                  <b>{sum(es).kcal}</b><small className="muted">קק״ל</small><span className="chev"><Icon name="chevron-down" /></span>
                </button>
              </h3>
            </header>
            <div id={`meal-${m.key}`} hidden={!open}>
              {es.map((e) => (
                <div key={e.id} className="row" role="button" tabIndex={0} onClick={() => setEditing(e)}>
                  <div className="grow"><div>{e.name}</div><small className="muted">{isDish(e) && <AiTag />}{amountLabel(e)}</small></div>
                  <b>{e.kcal}</b>
                  <button className="icon del" aria-label={`מחק: ${e.name}`} onClick={(ev) => { ev.stopPropagation(); remove(e); }}><Icon name="x" /></button>
                </div>
              ))}
              {/* a saved meal is foods that go together; a single food is already one tap in "הרגילים שלך" */}
              {es.length > 1 ? <footer><button onClick={() => saveMeal(m.key)}><Icon name="star" />שמור כארוחה</button></footer> : !es.length && <p className="empty">עוד לא נרשם כלום</p>}
            </div>
          </section>
        );
      })}
      </Group>

      <div className="day-actions">
        <button className="btn" onClick={onExport}><Icon name="download" />ייצוא CSV / PDF</button>
      </div>

      {adding && <AddDialog ctx={ctx} meal={adding} date={date} left={fitting ?? undefined} onClose={() => { setAdding(null); setFitting(null); setQuick((n) => n + 1); }} onAdded={added}
        onRemoved={(es) => setEntries((cur) => cur!.filter((x) => !es.some((e) => e.id === x.id)))}
        onPhoto={(p) => { setPhotos((cur) => [...cur, p]); setOpen(p.meal, true); }} />}
      {viewing && (
        <Modal title={`תמונה: ${MEALS.find((m) => m.key === viewing.meal)!.label}`} onClose={() => setViewing(null)}>
          <img src={viewing.url} alt="הארוחה שצולמה" />
          <button className="btn danger" onClick={() => removePhoto(viewing)}>מחק תמונה</button>
        </Modal>
      )}
      {editing && (
        <EntryDialog ctx={ctx} entry={editing} photos={photos.filter((p) => p.meal === editing.meal)} onPhoto={setViewing} onClose={() => setEditing(null)} onDelete={() => { remove(editing); setEditing(null); }}
          onSaved={(e) => saved(editing, e)} />
      )}
    </div>
  );
}



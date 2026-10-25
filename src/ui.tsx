import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { MACROS, MICROS, WATER_GOAL_ML, extraParts, isFFQ, microAmounts, microSources, type Item, type MicroAmount, type Nut, type Unit } from './lib';
import { Icon } from './icons';
import { DAILY_VALUES, DEFAULT_GOALS, DV_WHY, MICRO_INFO, PROTEIN_PER_KG, SALT_PER_SODIUM, SODIUM_MAX, type Goals } from './goals';

// A native modal <dialog>: the browser traps focus, closes it on Esc, and on Android closes it with the back
// button or gesture (close requests, Chrome 120+), so back no longer leaves the app. `onBack` gets that back
// press first and returns true when it handled it (going back one step inside the dialog) instead of closing.
// `footer` stays under the scrolling body, so rows never scroll beneath or past it.
export function Modal({ title, onClose, onBack, footer, children }: { title: string; onClose: () => void; onBack?: () => boolean; footer?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (!ref.current!.open) ref.current!.showModal(); }, []);
  return (
    <dialog ref={ref} className="modal" aria-label={title}
      // React passes a window opened inside this one (a guide article over the review list) its close request too; only our own closes us.
      onCancel={(e) => { if (e.target !== e.currentTarget) return; e.preventDefault(); if (!onBack?.()) onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <header><h2>{title}</h2><button className="icon" onClick={onClose} aria-label="סגור"><Icon name="x" /></button></header>
      <div className="modal-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </dialog>
  );
}

// The app's own confirm() and prompt(): the browser's boxes show the site's address and don't match the app.
// `ask` resolves to the typed text (or '' for a plain yes), or null when cancelled. `AskHost` is mounted once, in App.
type Asking = { title: string; text?: string; ok: string; danger?: boolean; field?: string; done: (v: string | null) => void };
let show: (a: Asking | null) => void = () => {};
const ask = (a: Omit<Asking, 'done'>) => new Promise<string | null>((done) => show({ ...a, done }));
export const confirmIt = async (title: string, ok: string, text?: string) => (await ask({ title, text, ok, danger: true })) != null;
export const promptIt = (title: string, field: string, ok: string) => ask({ title, field, ok });
export function AskHost() {
  const [a, setA] = useState<Asking | null>(null);
  const [text, setText] = useState('');
  show = (next) => { setText(''); setA(next); };
  if (!a) return null;
  const end = (v: string | null) => { setA(null); a.done(v); };
  return (
    <Modal title={a.title} onClose={() => end(null)}>
      {a.text && <p>{a.text}</p>}
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (!a.field || text.trim()) end(a.field ? text.trim() : ''); }}>
        {a.field && <label>{a.field}<input autoFocus required value={text} onChange={(e) => setText(e.target.value)} /></label>}
        <div className="grid2">
          <button className={a.danger ? 'btn danger' : 'btn primary'}>{a.ok}</button>
          <button type="button" className="btn" onClick={() => end(null)}>ביטול</button>
        </div>
      </form>
    </Modal>
  );
}

// One button for a photo: without `capture`, the phone offers both the camera and the gallery.
// While `reading` (the photo being read) is set, it shows that photo dimmed under a spinner instead.
// Two ways in: Android's file picker no longer offers the camera, so the camera gets its own button (capture).
// `children` is one more choice in the same row (the add window's "כתיבה"). `multiple` lets the gallery pick several.
export function PhotoPick({ camera, gallery, reading, busyText = '', onFile, multiple, className = 'btn', children }: { camera: string; gallery: string; reading?: File | null; busyText?: string; onFile: (f: File) => void; multiple?: boolean; className?: string; children?: ReactNode }) {
  if (reading) return <Reading file={reading} text={busyText} />;
  return (
    <div className={children ? 'choices' : 'grid2'}>
      <FileButton camera className={className} onFile={onFile}><Icon name="camera" />{camera}</FileButton>
      <FileButton multiple={multiple} className={className} onFile={onFile}><Icon name="image" />{gallery}</FileButton>
      {children}
    </div>
  );
}

// A button that picks a photo: with `camera`, the phone opens its camera straight away; otherwise the gallery.
// With `multiple`, `onFile` is called once for each photo picked.
export function FileButton({ camera, multiple, className, onFile, children }: { camera?: boolean; multiple?: boolean; className: string; onFile: (f: File) => void; children: ReactNode }) {
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    files.forEach(onFile);
  };
  return (
    <label className={className}>
      <input type="file" accept="image/*" capture={camera ? 'environment' : undefined} multiple={multiple} className="sr-only" onChange={pick} />
      {children}
    </label>
  );
}

// A picked photo as an <img> src, released when the photo changes or goes.
export function usePhotoUrl(file: File | null) {
  const [src, setSrc] = useState('');
  useEffect(() => { if (!file) return setSrc(''); const url = URL.createObjectURL(file); setSrc(url); return () => URL.revokeObjectURL(url); }, [file]);
  return src;
}

// Something being read: the photo dimmed under a spinner and what's happening. Words alone get a status line, not
// an empty photo frame, which looked as if a photo was being read.
export function Reading({ file, text }: { file: File | null; text: string }) {
  const src = usePhotoUrl(file);
  if (!file) return <p className="why" role="status"><span className="spinner" aria-hidden="true" />{text}</p>;
  return (
    <figure className="reading" role="status">
      {src && <img src={src} alt="" />}
      <figcaption><span className="spinner" aria-hidden="true" /><b>{text}</b><span>זה לוקח כמה שניות</span></figcaption>
    </figure>
  );
}

// A titled part of a page: the title (and an optional action) above a card, as in the diary's "ארוחות".
export function Group({ title, action, body = 'pad', className, children }: { title: ReactNode; action?: ReactNode; body?: string; className?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className={className} aria-labelledby={id}>
      <div className="group-head"><h2 id={id} className="eyebrow">{title}</h2>{action}</div>
      <div className={`card ${body}`}>{children}</div>
    </section>
  );
}

// Why a button is disabled, in readable text next to it (the button points here with aria-describedby).
export const Why = ({ id, children }: { id: string; children: ReactNode }) => <p className="why" id={id}><Icon name="info" />{children}</p>;

// Macro split by energy share (carbs/protein 4 kcal/g, fat 9 kcal/g).
export function macroShares(n: Nut) {
  const k = MACROS.map((m) => n[m.key] * m.kcalPerG);
  const t = k.reduce((a, b) => a + b, 0) || 1;
  return MACROS.map((m, i) => ({ ...m, g: n[m.key], pct: Math.round((k[i] / t) * 100), frac: k[i] / t }));
}

export function Donut({ n, size = 96, center }: { n: Nut; size?: number; center?: ReactNode }) {
  const shares = macroShares(n);
  const R = 42, C = 2 * Math.PI * R, gap = n.kcal ? 1.5 : 0;
  let off = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--line)" strokeWidth="11" />
        {n.kcal > 0 && shares.map((s) => {
          const len = Math.max(0, s.frac * C - gap);
          const el = (
            <circle key={s.key} cx="50" cy="50" r={R} fill="none" stroke={s.color} strokeWidth="11"
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 50 50)">
              <title>{`${s.label}: ${s.g} ג׳ (${s.pct}%)`}</title>
            </circle>
          );
          off += s.frac * C;
          return el;
        })}
      </svg>
      {center && <div className="donut-center">{center}</div>}
    </div>
  );
}

// Progress toward a goal: one accent arc, red once it's over.
export function Ring({ value, goal, size = 96, center }: { value: number; goal: number; size?: number; center?: ReactNode }) {
  const R = 44, C = 2 * Math.PI * R, f = goal ? Math.min(1, value / goal) : 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <circle className="ring-track" cx="50" cy="50" r={R} />
        {f > 0 && <circle className={value > goal ? 'ring-fill over' : 'ring-fill'} cx="50" cy="50" r={R} strokeDasharray={`${f * C} ${C}`} transform="rotate(-90 50 50)" />}
      </svg>
      {center && <div className="donut-center">{center}</div>}
    </div>
  );
}

export function MacroLegend({ n, goals }: { n: Nut; goals?: Partial<Record<'carbs' | 'fat' | 'protein', number | null>> }) {
  return (
    <div className="legend">
      {macroShares(n).map((s) => {
        const goal = goals?.[s.key];
        return (
          <div key={s.key} className="legend-row">
            <div className="legend-line">
              <span className="dot" style={{ background: s.color }} />
              <span className="grow">{s.label} <span className="muted">{s.pct}%</span></span>
              <span><b>{s.g}</b><span className="muted">{goal ? ` / ${goal}` : ''} ג׳</span></span>
            </div>
            {goal ? <div className="bar"><i style={{ width: `${Math.min(100, (s.g / goal) * 100)}%`, background: s.color }} /></div> : null}
          </div>
        );
      })}
    </div>
  );
}

// One amount against its goal, with a bar: a minimum ('min', green ✓ once reached), a soft limit ('max', green under it,
// amber "מעל היעד" over), or for reference only ('ref': no green or amber).
type GoalKind = 'min' | 'max' | 'ref';
// With `onClick` the row is a button that opens more about it (spans inside: a button holds phrasing content only).
function GoalRow({ label, value, goal, unit, kind, word = '', color, onClick }: { label: string; value: number; goal?: number; unit: string; kind: GoalKind; word?: string; color?: string; onClick?: () => void }) {
  const state = !goal ? '' : kind === 'min' ? (value >= goal ? 'done' : '') : kind === 'max' ? (value > goal ? 'high' : 'done') : '';
  const Row = onClick ? 'button' : 'div';
  return (
    <Row className="legend-row" onClick={onClick} aria-haspopup={onClick && 'dialog'}>
      <span className="legend-line">
        <span className="grow">{label}{state === 'done' && kind === 'min' && <span className="ok"> ✓ הושג</span>}{state === 'high' && <span className="high"> מעל היעד</span>}</span>
        <span><b>{value}</b><span className="muted">{goal ? ` / ${word}${goal}` : ''} {unit}</span></span>
      </span>
      {goal ? <span className="bar"><i className={state} style={{ width: `${Math.min(100, (value / goal) * 100)}%`, background: state || !color ? undefined : color }} /></span> : null}
    </Row>
  );
}

// The diary's goals: protein is a minimum to reach, carbs a soft limit to stay under.
// Fat is shown for reference only: no green or amber, since too little is as unhealthy as too much.
const DAY_GOALS = [{ key: 'protein', label: 'חלבון', word: 'לפחות ', kind: 'min' }, { key: 'carbs', label: 'פחמימות', word: 'עד ', kind: 'max' }, { key: 'fat', label: 'שומן', word: '', kind: 'ref' }] as const;
export function DayGoals({ n, goals }: { n: Nut; goals: Goals }) {
  return (
    <div className="legend">
      {DAY_GOALS.map((d) => <GoalRow key={d.key} label={d.label} value={n[d.key]} goal={goals[d.key]} unit="ג׳" kind={d.kind} word={d.word} color={`var(--${d.key})`} />)}
    </div>
  );
}

// Vitamins and minerals against the label's Daily Values, a row each like the macros. Sodium is a limit.
// Given `from` (the foods logged, and "היום" or "בתקופה"), a row opens what it does, how its goal was set and which
// foods gave it; `more` goes in that window too (the article on daily values: Guide imports this file, not the other way).
const SODIUM = 'נתרן (מ״ג)';
const microGoal = (m: MicroAmount) => ({ label: m.name, value: m.v, goal: DAILY_VALUES[m.key], unit: m.unit, kind: m.key === SODIUM ? 'max' : 'min', word: m.key === SODIUM ? 'עד ' : '' }) as const;
export function MicroGoals({ n, from, more }: { n: Nut; from?: { items: Item[]; when: string }; more?: ReactNode }) {
  const [open, setOpen] = useState<MicroAmount | null>(null);
  return (
    <div className="legend">
      {microAmounts(n).map((m) => <GoalRow key={m.key} {...microGoal(m)} onClick={from && (() => setOpen(m))} />)}
      {open && from && <MicroInfo m={open} from={from} more={more} onClose={() => setOpen(null)} />}
    </div>
  );
}

const pct = (v: number, of: number) => { const p = Math.round((v / of) * 100); return p ? `${p}%` : '<1%'; };
function MicroInfo({ m, from, more, onClose }: { m: MicroAmount; from: { items: Item[]; when: string }; more?: ReactNode; onClose: () => void }) {
  const g = microGoal(m), info = MICRO_INFO[m.key];
  const sources = microSources(from.items, m.key), total = sources.reduce((t, x) => t + x.v, 0);
  const salt = (mg: number) => Math.round((mg * SALT_PER_SODIUM) / 100) / 10;
  return (
    <Modal title={m.name} onClose={onClose}>
      <GoalRow {...g} />
      <h3>ממה הגיע {from.when}</h3>
      {sources.length ? (
        <table className="tbl">
          <thead><tr><th scope="col">מזון</th><th scope="col">{m.unit}</th><th scope="col">חלק</th></tr></thead>
          <tbody>{sources.map((x) => <tr key={x.name}><td>{x.name}</td><td>{x.v}</td><td>{pct(x.v, total)}</td></tr>)}</tbody>
        </table>
      ) : <p className="muted">שום דבר שנרשם {from.when} לא הכיל {m.name}.</p>}
      {info && <><h3>למה זה חשוב</h3><p>{info.why}</p></>}
      <h3>איך נקבע היעד</h3>
      <p>{g.goal ? `${g.word}${g.goal} ${m.unit} ליום: ${info?.goal ?? DV_WHY}` : 'אין לו ערך יומי רשמי.'}</p>
      {m.key === SODIUM && <p>במלח: {m.v} מ״ג נתרן הם כ־{salt(m.v)} ג׳ מלח, והגבול, {SODIUM_MAX} מ״ג, הוא כ־{salt(SODIUM_MAX)} ג׳, בערך כפית.</p>}
      {more}
      <p className="muted small">מידע כללי, לא ייעוץ רפואי.</p>
    </Modal>
  );
}

// The day's water against its goal, a glass at a time, with the same look as the macro rows above it.
const liters = (ml: number) => (ml / 1000).toLocaleString('he-IL', { maximumFractionDigits: 2 });
export function WaterLine({ ml, onAdd, onRemove }: { ml: number; onAdd: () => void; onRemove?: () => void }) {
  const done = ml >= WATER_GOAL_ML;
  return (
    <div className="legend-row" role="group" aria-label="מים">
      <div className="legend-line">
        <span className="grow">מים{done && <span className="ok"> ✓ הושג</span>}</span>
        <span role="status"><b>{liters(ml)}</b><span className="muted"> / {liters(WATER_GOAL_ML)} ליטר</span></span>
        <button className="icon" aria-label="פחות כוס מים" disabled={!onRemove} onClick={onRemove}><Icon name="minus" /></button>
        <button className="icon" aria-label="עוד כוס מים" onClick={onAdd}><Icon name="plus" /></button>
      </div>
      <div className="bar"><i className={done ? 'done' : ''} style={{ width: `${Math.min(100, (ml / WATER_GOAL_ML) * 100)}%` }} /></div>
    </div>
  );
}

// Where the diary's goals come from, with the general guidance to change them by.
export function GoalsInfo({ goals, more }: { goals: Goals; more?: ReactNode }) {
  return (
    <details>
      <summary><Icon name="chevron-down" />איך נקבעו היעדים?</summary>
      <div className="form small">
        <p>ברירת המחדל היא הערכים שבתוויות המזון, לאדם ממוצע שאוכל {DEFAULT_GOALS.kcal} קק״ל. כל אחד שונה, אז אפשר להתאים אותם לגוף ולמטרה שלך בהגדרות.</p>
        <h4>חלבון: לפחות {goals.protein} ג׳</h4>
        <p>החלבון תלוי במשקל הגוף. בהתאמה האישית האפליקציה מחשבת {PROTEIN_PER_KG} ג׳ לכל ק״ג, כדי לשמור על שריר ולבנות אותו, ולא סופרת משקל מעל BMI 25 כדי שמשקל עודף לא ינפח את היעד.</p>
        <table className="tbl">
          <thead><tr><th scope="col">מצב</th><th scope="col">ג׳ לכל ק״ג</th></tr></thead>
          <tbody>
            <tr><td>מינימום לאדם לא פעיל</td><td>0.8</td></tr>
            <tr><td>ירידה במשקל ושמירה על שריר</td><td><span dir="ltr">1.2–1.6</span></td></tr>
            <tr><td>אימוני כוח ובניית שריר</td><td><span dir="ltr">1.6–2.2</span></td></tr>
          </tbody>
        </table>
        <h4>פחמימות: עד {goals.carbs} ג׳</h4>
        <p>גבול רך: הפס ירוק מתחת ליעד וכתום מעליו. בהתאמה האישית בוחרים תוכנית מהטבלה.</p>
        <table className="tbl">
          <thead><tr><th scope="col">גישה</th><th scope="col">ג׳ ליום</th></tr></thead>
          <tbody>
            <tr><td>המלצה כללית (45–65% מ־2000 קק״ל)</td><td><span dir="ltr">225–325</span></td></tr>
            <tr><td>דל פחמימות</td><td>עד 130</td></tr>
            <tr><td>דל פחמימות מתון</td><td><span dir="ltr">50–100</span></td></tr>
            <tr><td>קטו (כדאי בליווי רופא)</td><td><span dir="ltr">20–50</span></td></tr>
          </tbody>
        </table>
        <h4>שומן: {goals.fat} ג׳</h4>
        <p>מוצג לעיון, בלי ירוק או כתום: הוא כבר בתוך הקלוריות. כדאי שלא ירד מתחת ל־20% מהקלוריות (הורמונים, ספיגת ויטמינים A, D, E, K).</p>
        {more}
        <p className="muted">מקורות: ההמלצות התזונתיות של האקדמיה הלאומית לרפואה בארה״ב (RDA) וההנחיות התזונתיות לאמריקאים; עמדת ISSN על חלבון (2017). מידע כללי, לא ייעוץ רפואי. לשינוי: הגדרות ← התאמת היעדים, או הקלדה ביעדים יומיים.</p>
      </div>
    </details>
  );
}

// A food's vitamins and minerals in one line, those it has. The day's and a period's are rows (MicroGoals).
export function MicroLine({ n }: { n: Nut }) {
  const parts = [...MICROS.filter((m) => n[m.key]).map((m) => `${m.label} ${n[m.key]} ${m.unit}`), ...extraParts(n.extra)];
  return parts.length ? <div className="micro muted">{parts.map((p) => <span key={p}>{p}</span>)}</div> : null;
}

type FoodLike = Nut & { name: string; servingG: number; source?: string | null };

// One-line nutrition summary for a food in lists: calories and macros for its serving size, in words.
// Micronutrients show once a food is picked (NutLine). Own foods and FFQ group averages get a tag.
export const MINE_HINT = '״שלי״ = הוספת או ערכת; השאר: משרד הבריאות.';
export function FoodSummary({ f, tags = true, kcal = true }: { f: FoodLike; tags?: boolean; kcal?: boolean }) {
  return (
    <small className="muted food-sum">
      {tags && f.source !== 'moh' && <span className="tag">שלי</span>}
      {isFFQ(f) && <span className="tag warn" title="ממוצע של כמה מזונות משאלון תזונה, לא מזון מסוים">ממוצע כללי</span>}
      <span>ל־{f.servingG} ג׳: {kcal && <><b className="kcal">{f.kcal} קק״ל</b> · </>}פחמימות {f.carbs} · שומן {f.fat} · חלבון {f.protein}</span>
    </small>
  );
}

// A search result: the name with its calories on the same line (like the usual foods), the macros under it.
export function FoodHit({ f, onClick }: { f: FoodLike; onClick: () => void }) {
  return (
    <button className="row hit" onClick={onClick}>
      <div className="grow"><div>{f.name}</div><FoodSummary f={f} kcal={false} /></div>
      <span className="kcal">{f.kcal}<span className="sr-only"> קק״ל</span></span>
    </button>
  );
}

// A unit as typed: "k of n weigh g grams". People know a package's weight and how many pieces are in it,
// rarely what one piece weighs, so the app divides. Saved as the weight of one.
export type UnitDraft = { k: string; n: string; g: string };
export const draftOf = (u: Unit): UnitDraft => ({ k: '1', n: u.n, g: String(u.g) });
export const unitOf = (d: UnitDraft): Unit => ({ n: d.n.trim(), g: Math.round((Number(d.g) / (Number(d.k) || 1)) * 100) / 100 });
export const UNIT_HINT = 'כמה יחידות שוקלות כמה גרם. לא יודעים כמה שוקלת אחת? כתבו את משקל האריזה וכמה יחידות יש בה, למשל 20 מסטיק = 28 ג׳, והמשקל של אחת יחושב לבד.';

export function UnitInputs({ d, set, autoFocus }: { d: UnitDraft; set: (d: UnitDraft) => void; autoFocus?: boolean }) {
  return (
    <>
      <input type="number" inputMode="decimal" min="0" step="any" className="unit-k" aria-label="כמה יחידות" value={d.k} onChange={(e) => set({ ...d, k: e.target.value })} />
      <input className="unit-n" placeholder="שם, למשל ״עדשה״" aria-label="שם היחידה" value={d.n} onChange={(e) => set({ ...d, n: e.target.value })} autoFocus={autoFocus} />
      <span aria-hidden="true">=</span>
      <input type="number" inputMode="decimal" min="0" step="any" className="unit-g" placeholder="גרם" aria-label="שוקלות יחד (גרם)" value={d.g} onChange={(e) => set({ ...d, g: e.target.value })} />
      <span className="muted">ג׳</span>
    </>
  );
}

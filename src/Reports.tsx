import { useEffect, useState } from 'react';
import { goalsOf } from './goals';
import type { Ctx } from './App';
import { MEALS, MICROS, addDays, microKey, amountLabel, daysBetween, fmtDate, loadEntries, saveWeight, scale, sum, today, type Entry, type Nut } from './lib';
import { Group, Donut, MacroLegend, MicroGoals } from './ui';
import { Icon } from './icons';
import { ArticleLink } from './Guide';

const PRESETS: [string, number][] = [['יום', 0], ['שבוע', 6], ['חודש', 29]];

export default function Reports({ ctx, date }: { ctx: Ctx; date: string }) {
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  useEffect(() => { setEntries(null); if (from <= to) loadEntries(from, to).then(setEntries); }, [from, to]);

  const days = from <= to ? daysBetween(from, to) : [];
  const byDay = days.map((d) => ({ d, es: (entries ?? []).filter((e) => e.date === d) })).map((x) => ({ ...x, t: sum(x.es) }));
  const logged = byDay.filter((x) => x.es.length);
  const avg: Nut = logged.length ? scale(sum(logged.map((x) => x.t)), 1 / logged.length) : sum([]);
  const goals = goalsOf(ctx.profile), goal = goals.kcal;
  const weights = ctx.weights.filter((w) => w.date >= from && w.date <= to);
  const waists = weights.flatMap((w) => (w.waist ? [{ id: w.id, date: w.date, v: w.waist }] : []));
  const title = from === to ? fmtDate(from) : `${fmtDate(from, { day: 'numeric', month: 'short' })} – ${fmtDate(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  const csv = () => {
    const extras = Object.keys(sum(entries ?? []).extra ?? {}); // a column for each other vitamin logged in the range
    const head = ['תאריך', 'ארוחה', 'מזון', 'כמות', 'יחידה', 'גרם', 'קלוריות', 'פחמימות', 'שומן', 'חלבון', ...MICROS.map(microKey), ...extras];
    const rows = (entries ?? []).sort((a, b) => a.date.localeCompare(b.date)).map((e) =>
      [e.date, MEALS.find((m) => m.key === e.meal)!.label, e.name, e.qty ?? e.grams, e.unit ?? 'גרם', e.grams, e.kcal, e.carbs, e.fat, e.protein, ...MICROS.map((m) => e[m.key] ?? ''), ...extras.map((k) => e.extra?.[k] ?? '')]);
    const text = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    a.download = `food-${from}${from === to ? '' : '_' + to}.csv`;
    a.click();
  };

  return (
    <div className="stack report">
      <h1 className="page-title no-print">דוחות</h1>
      <Group title="טווח וייצוא" body="pad form" className="no-print">
        <div className="seg">
          {PRESETS.map(([l, n]) => <button key={l} className={from === addDays(to, -n) ? 'on' : ''} onClick={() => setFrom(addDays(to, -n))}>{l}</button>)}
        </div>
        <div className="amount-row">
          <label className="grow"><span className="muted small">מתאריך</span><input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
          <label className="grow"><span className="muted small">עד תאריך</span><input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
        </div>
        <div className="grid2">
          <button className="btn" onClick={csv} disabled={!entries?.length}><Icon name="download" />CSV</button>
          <button className="btn" onClick={() => print()} disabled={!entries?.length}><Icon name="download" />PDF</button>
        </div>
        <p className="muted small">PDF: בחלון ההדפסה בחר ״שמירה כ-PDF״.</p>
      </Group>

      <WeighIn ctx={ctx} />
      {weights.length > 1 && <TrendChart title="משקל" unit="ק״ג" data={weights.map((w) => ({ id: w.id, date: w.date, v: w.kg }))} />}
      {waists.length > 1 && <TrendChart title="מותניים" unit="ס״מ" data={waists} />}
      <h2 className="print-only">דוח תזונה · {title}</h2>
      {entries === null ? <div className="muted center">טוען…</div> : !logged.length ? <div className="muted center">אין רישומים בטווח הזה</div> : (
        <>
          <section className="card summary">
            <Donut n={avg} center={<><b>{avg.kcal}</b><small>{days.length > 1 ? 'ממוצע ליום' : 'קק״ל'}</small></>} />
            <div className="grow">
              <div className="kcal-line"><span>{days.length > 1 ? `ממוצע ל-${logged.length} ימים מתועדים` : 'סה״כ'}</span><b>{avg.kcal}</b><span className="muted">/ {goal} קק״ל</span></div>
              <MacroLegend n={avg} goals={goals} />
            </div>
          </section>
          <section className="card pad stack">
            <h3>ויטמינים ומינרלים{days.length > 1 ? ' · ממוצע ליום' : ''}</h3>
            <MicroGoals n={avg} from={{ items: entries, when: days.length > 1 ? 'בתקופה' : 'ביום הזה' }} more={<ArticleLink slug="6-vitamins">עוד על הערך היומי</ArticleLink>} />
          </section>
          {days.length > 1 && <KcalChart data={byDay.map((x) => ({ d: x.d, v: x.t.kcal }))} goal={goal} />}
          {days.length > 1 && (
            <section className="card pad">
              <h3>לפי יום</h3>
              <table className="tbl">
                <thead><tr><th>תאריך</th><th>קק״ל</th><th>פחמ׳</th><th>שומן</th><th>חלבון</th></tr></thead>
                <tbody>{logged.map((x) => <tr key={x.d}><td>{fmtDate(x.d, { weekday: 'short', day: 'numeric', month: 'numeric' })}</td><td>{x.t.kcal}</td><td>{x.t.carbs}</td><td>{x.t.fat}</td><td>{x.t.protein}</td></tr>)}</tbody>
              </table>
            </section>
          )}
          {/* the foods of each day: the diary already shows them, so only the PDF lists them */}
          {logged.map((x) => (
            <section key={x.d} className="card pad print-only">
              <h3>{fmtDate(x.d)} <small className="muted">· {x.t.kcal} קק״ל</small></h3>
              {MEALS.map((m) => {
                const es = x.es.filter((e) => e.meal === m.key);
                return es.length ? (
                  <div key={m.key}>
                    <h4><Icon name={m.icon} />{m.label} <small className="muted">· {sum(es).kcal} קק״ל</small></h4>
                    {es.map((e) => <div key={e.id} className="detail-row"><span className="grow">{e.name}</span><small className="muted">{amountLabel(e)}</small><b>{e.kcal}</b></div>)}
                  </div>
                ) : null;
              })}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

// Logging weight and waist, next to their charts. It never changes the goals; tailoring (Settings) does.
function WeighIn({ ctx }: { ctx: Ctx }) {
  const mine = ctx.weights.find((w) => w.date === today()), last = ctx.weights.at(-1);
  const [kg, setKg] = useState(mine ? String(mine.kg) : '');
  const [waist, setWaist] = useState(mine?.waist ? String(mine.waist) : '');
  const [msg, setMsg] = useState('');
  const save = async () => {
    ctx.setWeights(await saveWeight(ctx.weights, Number(kg), Number(waist) || null));
    setMsg('השקילה נשמרה');
  };
  return (
    <Group title="שקילה" body="pad form" className="no-print">
      <div className="grid2">
        <label><span>משקל היום (ק״ג)</span><input type="number" inputMode="decimal" step="0.1" value={kg} onChange={(e) => setKg(e.target.value)} /></label>
        <label><span>מותניים (ס״מ, לא חובה)</span><input type="number" inputMode="decimal" step="0.5" value={waist} onChange={(e) => setWaist(e.target.value)} /></label>
      </div>
      {last && <p className="muted small">שקילה אחרונה: {last.kg} ק״ג{last.waist ? `, מותניים ${last.waist} ס״מ` : ''}, {fmtDate(last.date, { day: 'numeric', month: 'long' })}</p>}
      <p className="muted small">פעם בשבוע, בבוקר; מותניים בגובה הטבור. השקילה לא משנה את היעדים; לעדכון: הגדרות ← התאמה אישית.</p>
      <button className="btn primary" onClick={save} disabled={!(Number(kg) > 0)}>שמור שקילה</button>
      <div role="status">{msg && <p className="muted small">{msg}</p>}</div>
    </Group>
  );
}

function KcalChart({ data, goal }: { data: { d: string; v: number }[]; goal: number }) {
  const W = 600, H = 200, P = 26;
  const max = Math.max(goal, ...data.map((x) => x.v)) * 1.1 || 1;
  const bw = (W - P) / data.length;
  const y = (v: number) => H - P - (v / max) * (H - P * 1.5);
  return (
    <section className="card pad">
      <h3>קלוריות ליום</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" style={{ direction: 'ltr' }} role="img" aria-label="קלוריות ליום">
        <line x1={0} x2={W} y1={H - P} y2={H - P} stroke="var(--line)" />
        {data.map((x, i) => {
          const h = H - P - y(x.v), cx = W - P / 2 - (i + 0.5) * bw; // RTL: first day on the right
          return (
            <g key={x.d}>
              <rect x={cx - bw * 0.35} y={y(x.v)} width={bw * 0.7} height={Math.max(0, h)} rx={Math.min(4, bw * 0.2)} fill={goal && x.v > goal ? 'var(--warn)' : 'var(--accent)'}>
                <title>{`${fmtDate(x.d, { day: 'numeric', month: 'numeric' })}: ${x.v} קק״ל`}</title>
              </rect>
              {(data.length <= 10 || i % Math.ceil(data.length / 10) === 0) && <text x={cx} y={H - 8} textAnchor="middle" className="axis">{fmtDate(x.d, { day: 'numeric', month: 'numeric' })}</text>}
            </g>
          );
        })}
        {goal > 0 && <><line x1={0} x2={W} y1={y(goal)} y2={y(goal)} stroke="var(--muted)" strokeDasharray="4 4" /><text x={4} y={y(goal) - 4} className="axis" textAnchor="start">יעד {goal}</text></>}
      </svg>
    </section>
  );
}

// A measurement over the range as a line, oldest on the right (RTL); the heading says the change in words.
type Point = { id: string; date: string; v: number };
function TrendChart({ title, unit, data }: { title: string; unit: string; data: Point[] }) {
  const W = 600, H = 160, P = 26;
  const lo = Math.min(...data.map((p) => p.v)) - 1, hi = Math.max(...data.map((p) => p.v)) + 1;
  const t0 = Date.parse(data[0].date), span = Date.parse(data.at(-1)!.date) - t0 || 1;
  const x = (p: Point) => W - P - ((Date.parse(p.date) - t0) / span) * (W - 2 * P);
  const y = (p: Point) => H - P - ((p.v - lo) / (hi - lo)) * (H - 2 * P);
  const first = data[0], last = data.at(-1)!, diff = Math.round((last.v - first.v) * 10) / 10;
  const day = (d: string) => fmtDate(d, { day: 'numeric', month: 'numeric' });
  return (
    <section className="card pad no-print">
      <h3>{title} <small className="muted">· {diff < 0 ? `ירידה של ${-diff} ${unit}` : diff > 0 ? `עלייה של ${diff} ${unit}` : 'ללא שינוי'}</small></h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${title}: מ־${first.v} ${unit} ב־${day(first.date)} ל־${last.v} ${unit} ב־${day(last.date)}`}>
        <polyline points={data.map((p) => `${x(p)},${y(p)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
        {data.map((p) => <circle key={p.id} cx={x(p)} cy={y(p)} r={4} fill="var(--accent)"><title>{`${day(p.date)}: ${p.v} ${unit}`}</title></circle>)}
        {[first, last].map((p) => <text key={p.id} x={x(p)} y={H - 8} textAnchor="middle" className="axis">{day(p.date)}</text>)}
        {[first, last].map((p) => <text key={p.id} x={x(p)} y={y(p) - 10} textAnchor="middle" className="axis">{p.v}</text>)}
      </svg>
    </section>
  );
}

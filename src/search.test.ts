// Search ranking and the meal parser against the real MoH database. Run: npm test (plain Node, no packages).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Food } from './db';
import { GRAMS, candidatesFor, isFFQ, kcalOff, matchFoods, parseLine, pickedParsed, matchMealWith, repeatOf, sameFood, searchFoods, splitAnd, unitFor } from './search.ts';

const moh: Food[] = JSON.parse(readFileSync(new URL('../public/foods/moh.json', import.meta.url), 'utf8'));
const first = (q: string, foods = moh, recent: string[] = []) => searchFoods(foods, q, recent)[0]?.name ?? '';
const own = (id: string, name: string, extra: Partial<Food> = {}): Food => ({ id, name, servingG: 100, kcal: 0, carbs: 0, fat: 0, protein: 0, ...extra });

test('plain foods come before processed ones', () => {
  assert.match(first('ענבים'), /^ענבים.*טרי/); // not juice or syrup
  assert.match(first('ביצה'), /^ביצה שלמה/); // a hen's egg, not a turkey's
  assert.match(first('תפוח'), /^תפוח עץ/);
  // dried, baked and powdered forms stay out of the top two unless typed
  for (const q of ['אגס', 'משמש', 'אננס', 'ביצה']) {
    const top = searchFoods(moh, q, []).slice(0, 2).map((f) => f.name);
    assert.ok(!top.some((n) => /מיובש|אפוי/.test(n)), `${q}: ${top.join(' | ')}`);
  }
  assert.match(first('אננס מיובש'), /מיובש/);
});

test('a soup finds a cooked soup, not a packet one, unless typed', () => {
  // the owner's restaurant corn soup came back as Knorr's instant packet
  for (const q of ['מרק תירס', 'מרק עוף', 'מרק אפונה', 'מרק שעועית']) assert.doesNotMatch(first(q), /מאבק|נמס/, q);
  assert.match(matchFoods(moh, 'מרק תירס', [])[0].name, /^מרק תירס/);
  assert.match(first('מרק תירס נמס'), /נמס בכוס/);
});

test('a meat finds the meat, not a dish, an organ or its fat', () => {
  assert.match(first('עוף'), /^בשר עוף,/); // was "פאי עוף", then "שומן עוף"
  assert.match(first('בקר'), /^בשר בקר,/);
  assert.match(first('חזה עוף'), /^בשר עוף, חזה, ללא עצם, מבושל/); // not stuffed or in sauce
  assert.match(first('כבד עוף'), /כבד/); // typed, so found
});

test('everyday searches: whole words, either/or names, niche versions last', () => {
  assert.match(first('קולה'), /^משקה קל, קולה/); // not "רום וקולה"
  assert.match(first('פסטה'), /^אטריות\/פסטה, חיטה/); // "X/Y" is either word; not gluten-free corn pasta
  assert.doesNotMatch(first('סלמון'), /מוס/); // not salmon mousse
  assert.match(first('סלט ירקות'), /^סלט ירקות/); // "ללא תוספת שמן" (no added oil) isn't an oil dish
  assert.match(first('פסטה ללא גלוטן'), /גלוטן/); // typed, so found
});

test('a Hebrew plural finds the singular', () => {
  assert.match(first('ביצים'), /^ביצה/);
  assert.match(first('עגבניות'), /^עגבניה/);
  // the owner couldn't find egg whites
  assert.match(first('חלבונים'), /^ביצה חלבון/);
  assert.match(first('חלבוני ביצה'), /^ביצה חלבון/); // the singular ends in a final letter
  assert.match(first('לימונים'), /^לימון/);
});

test('FFQ averages come last', () => {
  const hits = searchFoods(moh, 'ענבים', []);
  assert.ok(hits.some(isFFQ));
  assert.ok(isFFQ(hits.at(-1)!));
});

test('recent and own foods come first, hidden ones never', () => {
  const grapes = searchFoods(moh, 'ענבים', []);
  assert.equal(first('ענבים', moh, [grapes[3].id]), grapes[3].name);
  const mine = own('mine', 'ענבים מהשוק');
  assert.equal(first('ענבים', [...moh, mine]), mine.name);
  assert.notEqual(first('ענבים', moh.map((f) => (f.id === grapes[0].id ? { ...f, hidden: true } : f))), grapes[0].name);
});

test('a word found only inside another never beats a whole-word match, even a recent or own food', () => {
  // the owner's "תה נענע" got whole milk: "תה" is inside "יטבתה", and milk is logged often
  const milk = moh.find((f) => f.name.startsWith('חלב מלא /טבעי'))!;
  assert.match(matchFoods(moh, 'תה נענע', [milk.id])[0].name, /^תה/);
  assert.match(first('תה', [...moh, own('mine', 'שוקו יטבתה')]), /^תה/);
});

test('an empty search lists recent foods, newest first', () => {
  const ids = [moh[5].id, moh[1].id];
  assert.deepEqual(searchFoods(moh, '', ids).map((f) => f.id), ids);
});

test('a typed meal splits into items with amounts', () => {
  assert.deepEqual(parseLine('יוגורט 150 גרם, 10 ענבים, כף חמאת בוטנים').map(({ query, qty, unit }) => [query, qty, unit]), [
    ['יוגורט', 150, GRAMS],
    ['ענבים', 10, null],
    ['חמאת בוטנים', null, 'כף'],
  ]);
});

test('meal parser: words, "and", sizes and joined numbers', () => {
  const items = (t: string) => parseLine(t).map(({ query, qty, unit }) => [query, qty, unit]);
  assert.deepEqual(items('חצי כוס אורז וכפית שמן'), [['אורז', 0.5, 'כוס'], ['שמן', null, 'כפית']]);
  assert.deepEqual(items('יוגורט 150 גרם 10 ענבים'), [['יוגורט', 150, GRAMS], ['ענבים', 10, null]]);
  assert.deepEqual(items('ענבים 150'), [['ענבים', 150, null]]);
  assert.deepEqual(items('150גרם יוגורט'), [['יוגורט', 150, GRAMS]]);
  assert.deepEqual(items('שתי פרוסות לחם'), [['לחם', 2, 'פרוסה']]);
  assert.deepEqual(items('כף גדושה סוכר'), [['סוכר', null, 'כף גדושה']]);
  assert.deepEqual(items('לחם עם חמאה'), [['לחם', null, null], ['חמאה', null, null]]);
  // spoken: "של" after an amount, and a number with an extra yod
  assert.deepEqual(items('שתי כפות של עגבנייה'), [['עגבניה', 2, 'כף']]);
  assert.deepEqual(items('שניים מלפפונים, כמה שניצלים'), [['מלפפונים', 2, null], ['שניצלים', 3, null]]);
});

test('spelled with an extra yod or vav, a food is still found', () => {
  // the owner's "שתי כפות של עגבנייה" found nothing: the database spells it "עגבניה"
  assert.match(first('עגבנייה'), /^עגבניה, טריה/);
  assert.match(first('לחמנייה'), /^לחמניה/);
});

test('unitFor: bare numbers, named units and fallbacks', () => {
  const grapes = searchFoods(moh, 'ענבים', [])[0];
  assert.deepEqual(unitFor(grapes, { qty: 150, unit: null }), { qty: 150, unit: { n: GRAMS, g: 1 } }); // 20+ means grams
  assert.equal(unitFor(grapes, { qty: 2, unit: null }).unit.n, 'יחידה בינונית'); // small means pieces, medium by default
  assert.deepEqual(unitFor(grapes, { qty: 1, unit: 'כף' }).unit, { n: 'כף', g: 15 }); // no such unit: typical weight
  assert.equal(unitFor(grapes, { qty: null, unit: GRAMS }).qty, grapes.servingG);
});

test('unitFor: a photo\'s weight guess overrules a unit far off it', () => {
  const byId = (id: string) => moh.find((f) => f.id === id)!;
  const lettuce = byId('moh-3588'), potato = byId('moh-3499'), schnitzel = byId('moh-818');
  assert.equal(unitFor(lettuce, { qty: 4, unit: 'יחידה', grams: 40 }).unit.n, 'עלה'); // 4 leaves, not 4 heads of 648 g
  assert.deepEqual(unitFor(potato, { qty: 6, unit: 'יחידה', grams: 300 }), { qty: 300, unit: { n: GRAMS, g: 1 } }); // small ones: no unit fits
  assert.equal(unitFor(schnitzel, { qty: 2, unit: 'יחידה', grams: 160 }).unit.n, 'יחידה קטנה'); // another size that fits
  // star fruit has no piece size: "3 יחידה" was logged as 3 g; the photo's 120 g stands instead
  const star = moh.find((f) => f.name === 'קרמבולה, טרי')!;
  assert.deepEqual(unitFor(star, { qty: 3, unit: 'יחידה', grams: 120 }), { qty: 120, unit: { n: GRAMS, g: 1 } });
  assert.equal(unitFor(schnitzel, { qty: 2, unit: 'יחידה', grams: 300 }).unit.n, 'יחידה בינונית'); // close enough: kept
  // the owner's leftover rice came back "3 כף" but 120 g: photos overestimate, so the smaller amount stays
  assert.deepEqual(unitFor(byId('moh-2721'), { qty: 3, unit: 'כף', grams: 120 }), { qty: 3, unit: { n: 'כף', g: 11 } });
  assert.equal(unitFor(lettuce, { qty: 3, unit: 'עלה', grams: 40 }).unit.n, 'עלה'); // leaves are a unit of their own
});

test('a typed word the name negates loses: cooked rice is not "לא מבושל"', () => {
  for (const q of ['אורז לבן מבושל', 'אורז מבושל']) assert.match(matchFoods(moh, q, [])[0].name, /^אורז לבן, מבושל/);
  assert.match(matchFoods(moh, 'אורז לא מבושל', [])[0].name, /לא מבושל/);
  assert.deepEqual(parseLine('3 עלים חסה').map((p) => [p.qty, p.unit]), [[3, 'עלה']]);
});

test('a leading "ו" is dropped when nothing matches, and "X וY" splits in two', () => {
  assert.match(matchFoods(moh, 'וגרנולה', [])[0].name, /גרנולה/);
  assert.deepEqual(splitAnd(moh, parseLine('קפה וגרנולה'), []).map((p) => p.query), ['קפה', 'גרנולה']);
});

test('a food that exists only as a dish ingredient falls back to the plain food', () => {
  assert.match(first('גזר'), /^גזר, טרי/); // not "גזר לבן" (parsnip)
  assert.match(matchFoods(moh, 'גזר כבוש', [])[0].name, /^גזר, טרי/); // not potato salad with carrot and pickles
  assert.match(matchFoods(moh, 'סלט כרוב כבוש', [])[0].name, /^סלט כרוב כבוש/); // the real food when there is one
  assert.match(matchFoods(moh, 'פלפל חריף כבוש', [])[0].name, /^פלפל חריף, כבוש/);
  assert.match(matchFoods(moh, 'חזה עוף', [])[0].name, /^בשר עוף, חזה/); // "חזה" is in the name, not the head: unchanged
});

test('a photo\'s potato: boiled is plain boiled, mashed is פירה, an unknown word is dropped', () => {
  assert.match(matchFoods(moh, 'תפוח אדמה מבושל', [])[0].name, /מבושלים.*ללא תוספת שומן/); // not fried, not with oil
  assert.match(matchFoods(moh, 'תפוח אדמה מעוך', [])[0].name, /פירה/);
  assert.match(matchFoods(moh, 'תפוח אדמה מבושל בתנור', [])[0].name, /^תפוחי אדמה/);
});

test('star fruit: "כוכבית" and a photo\'s "כוכבית (קרמבולה)" find the carambola', () => {
  // the owner's photo named it "כוכבית (קרמבולה)": nothing matched, so the AI "broke it into ingredients", itself
  assert.match(first('כוכבית'), /^קרמבולה, טרי/);
  assert.match(matchFoods(moh, 'כוכבית (קרמבולה)', [])[0].name, /^קרמבולה, טרי/);
  assert.match(matchFoods(moh, 'זוקיני (קישוא)', [])[0].name, /^קישואים/); // any such pair: the name the database knows
});

test('staples find the plain everyday version', () => {
  assert.match(first('פיתה'), /^פיתה, פיתה ביס/); // not toasted ("קלויה") or a brand's
  assert.match(first('פיתות'), /^פיתה, פיתה ביס/);
  assert.match(first('פיתה דרוזית'), /^פיתה דרוזית/); // a typed kind still wins
  assert.match(first('לחמניה'), /^לחמניה לבנה/); // not anise
  assert.match(first('שניצלים'), /^שניצל חזה עוף/); // not spinach or corn
  assert.match(first('שניצל תירס'), /^שניצל תירס/);
});

test('calories that don\'t fit the macros: the owner\'s cottage cheese, its sodium read as calories', () => {
  const label = { kcal: 95, fat: 5, carbs: 1.5, protein: 11 }; // as printed: 4×11 + 4×1.5 + 9×5 = 95
  assert.equal(kcalOff(label), null);
  assert.equal(kcalOff({ ...label, kcal: 350 }), 95); // as the scan saved it
  assert.equal(kcalOff({ kcal: 0, fat: 0, carbs: 0, protein: 0 }), null); // a vitamin
  assert.equal(kcalOff({ kcal: 8, fat: 0.1, carbs: 1.6, protein: 0.3 }), null); // a cucumber: small numbers, small gaps
});

test('a food you already have: same name, or your own with the same numbers; 20% and 25% yogurt differ', () => {
  const y25 = own('y25', 'יוגורט מולר 25 חלבון', { source: 'user', kcal: 82, protein: 12.5, fat: 2, carbs: 2.2 });
  const foods = [...moh, y25];
  assert.equal(sameFood(foods, { name: 'יוגורט חלבון מולר', servingG: 100, kcal: 82, protein: 12.5, fat: 2, carbs: 2.2 })?.id, 'y25'); // scanned again, named otherwise
  assert.equal(sameFood(foods, { name: 'יוגורט 25 גרם', servingG: 200, kcal: 164, protein: 25, fat: 4, carbs: 4.4 })?.id, 'y25'); // per 200 g, same food
  assert.equal(sameFood(foods, { name: 'יוגורט מולר 20 חלבון', servingG: 100, kcal: 75, protein: 10, fat: 2.5, carbs: 3 }), undefined);
  assert.equal(sameFood(foods, { name: 'יוגורט מולר 25 חלבון', servingG: 100, kcal: 1, protein: 0, fat: 0, carbs: 0 })?.id, 'y25'); // the name alone
  assert.equal(sameFood(foods, { ...y25 }), undefined); // editing it isn't a duplicate of itself
  assert.equal(sameFood([own('v', 'ויטמין D', { source: 'user' })], { name: 'מגנזיום', servingG: 100, kcal: 0, protein: 0, fat: 0, carbs: 0 }), undefined); // two supplements, both zero
});

test('the AI\'s picks: an offered food with its amount, a dish it lacks as ingredients, anything else the search\'s', () => {
  const seen = [
    { name: 'מרק תירס', qty: 1, unit: 'כוס', grams: 300, about: 'סמיך ושמנתי, ממסעדת סושי' },
    { name: 'מרק תירס', qty: 1, unit: 'כוס', grams: 240 },
    { name: 'ענבים', qty: 10, unit: 'יחידה', grams: 60 },
    { name: 'לחם', qty: 1, unit: 'פרוסה', grams: 30 },
  ];
  const cands = candidatesFor(moh, seen, []);
  assert.ok(cands[0].length > 1 && cands[0].length <= 10);
  const chosen = cands[0].at(-1)!; // not the search's first
  const out = pickedParsed(seen, [
    { id: null, qty: 1, unit: 'כוס', grams: 300, parts: [{ name: 'תירס', qty: 120, unit: 'גרם', grams: 120 }, { name: 'שמנת מתוקה', qty: 3, unit: 'כף', grams: 45 }] },
    { id: chosen.id, qty: 2, unit: 'כוס', grams: 480 },
    { id: 'not-offered', qty: 10, unit: 'יחידה', grams: 60 },
  ], cands);
  assert.deepEqual(out.map((p) => [p.query, p.dish, p.foodId, p.qty]), [
    ['תירס', 'מרק תירס', undefined, 120],
    ['שמנת מתוקה', 'מרק תירס', undefined, 3],
    ['מרק תירס', undefined, chosen.id, 2], // the size the answer gave
    ['ענבים', undefined, undefined, 10], // an id that wasn't offered is ignored
    ['לחם', undefined, undefined, 1], // no pick: the search's match
  ]);
});

test('a guessed fat stays a guess (offered, not added) until an answer says how much', async () => {
  const butter = { name: 'חמאה', qty: 1, unit: 'כפית', grams: 5, hidden: true };
  const seen = { items: [{ name: 'לחם', qty: 1, unit: 'פרוסה', grams: 30 }, butter], questions: [{ item: 1, text: 'חמאה על הלחם?', options: ['בלי', 'כפית'] }] };
  type Sent = { qty: number; unit: string; grams: number; candidates: { id: string }[] };
  const keep = async (b: { items: unknown[] }) => (b.items as Sent[]).map((i) => ({ id: i.candidates[0].id, qty: i.qty, unit: i.unit, grams: i.grams }));
  const hidden = async (answers: (string | undefined)[]) => (await matchMealWith(keep, moh, [], seen, '', answers)).map((p) => !!p.hidden);
  assert.deepEqual(await hidden([]), [false, true]); // not answered: only offered
  assert.deepEqual(await hidden(['כפית']), [false, false]); // "כפית": she said so, it counts
});

test('an answer of "none" drops the item it was about', () => {
  const seen = [{ name: 'סלט ירקות', qty: 2, unit: 'כוס', grams: 300 }, { name: 'שמן זית', qty: 1, unit: 'כף', grams: 10, hidden: true }];
  const cands = candidatesFor(moh, seen, []);
  const out = pickedParsed(seen, [{ id: cands[0][0].id, qty: 2, unit: 'כוס', grams: 300 }, { id: cands[1][0].id, qty: 0, unit: 'כף', grams: 0 }], cands);
  assert.deepEqual(out.map((p) => p.query), ['סלט ירקות']);
});

test('the same food logged in the last half hour is a repeat', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  const ago = (min: number) => new Date(now - min * 60000).toISOString();
  const logged = [
    { foodId: 'moh-1', name: 'עוגת שוקולד', created_at: ago(40) },
    { foodId: 'moh-1', name: 'עוגת שוקולד', created_at: ago(5) },
    { foodId: null, name: 'מרק תירס', created_at: ago(12) },
    { foodId: 'moh-2', name: 'ענבים' }, // still waiting to be sent: no time yet
  ];
  assert.deepEqual(repeatOf(logged, [{ foodId: 'moh-1', name: 'עוגת שוקולד' }], now), { name: 'עוגת שוקולד', min: 5 });
  assert.deepEqual(repeatOf(logged, [{ foodId: null, name: ' מרק  תירס' }], now), { name: 'מרק תירס', min: 12 }); // a dish, by name
  assert.equal(repeatOf(logged, [{ foodId: 'moh-3', name: 'מרק תירס' }], now), null); // a food isn't a dish of the same name
  assert.equal(repeatOf(logged, [{ foodId: 'moh-2', name: 'ענבים' }], now), null);
  assert.equal(repeatOf(logged.slice(0, 1), [{ foodId: 'moh-1', name: 'עוגת שוקולד' }], now), null); // 40 minutes ago
});

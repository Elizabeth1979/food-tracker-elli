// Screen test: the main flows, clicked through like on a phone, in test mode (no sign-in, sample photo answer).
// Run: npm run test:screens. Starts `vite --mode demo` itself. Needs a Chromium: Playwright's
// (`npx playwright install chromium`) or one named by CHROMIUM_PATH.
// Elements are found the way a person (or a screen reader) finds them: by role and visible or accessible name,
// never by CSS class, so a redesign that keeps behavior keeps this test green.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const PORT = 5175;
const URL = `http://localhost:${PORT}/`;
let server, browser, page;
const native = []; // browser confirm/prompt boxes that opened: there should be none
afterEach(() => assert.deepEqual(native.splice(0), [], 'a browser dialog opened instead of the app\'s own'));

before(async () => {
  server = spawn('npx', ['vite', '--mode', 'demo', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
  for (let i = 0; ; i++) {
    try { if ((await fetch(URL)).ok) break; } catch { /* not up yet */ }
    if (i > 60) throw new Error('test-mode server did not start');
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  page = await browser.newPage({ viewport: { width: 400, height: 860 }, hasTouch: true, isMobile: true, locale: 'he-IL' });
  await page.clock.setFixedTime(new Date('2026-10-21T13:00:00')); // lunchtime: the add window starts on lunch
  page.on('dialog', (d) => { native.push(d.message()); void d.dismiss(); }); // the app asks in its own windows
  await page.goto(URL);
});
after(async () => {
  await browser?.close();
  if (server) process.kill(-server.pid);
});

// ---- the vocabulary of the app, by role and name ----
const button = (name, scope = page) => scope.getByRole('button', { name, exact: typeof name === 'string' });
const dialog = () => page.getByRole('dialog');
const asked = (title) => page.getByRole('dialog', { name: title }); // the app's own confirm/prompt, over another window
// The ＋ window adds to the meal of the time of day, so a test picks the meal by setting the clock (same day).
const at = (time) => page.clock.setFixedTime(new Date(`2026-10-21T${time}:00`));
const openFoods = async () => { await button(/הגדרות/).tap(); await button(/המזונות והארוחות שלי/).tap(); };
const mealTab = (name) => dialog().getByRole('group', { name: 'ארוחה' }).getByRole('button', { name: new RegExp(name) });
const meal = (label) => page.getByRole('region', { name: label });
const entries = (label) => meal(label).getByRole('button', { name: /^מחק: / }); // one delete button per entry
const openAdd = async () => { await button(/הוספה$/).tap(); await dialog().waitFor(); };
// The day's vitamins and minerals, folded under one summary; `vitamin(name)` reads a row's amount (opens it if needed).
const vitamins = () => page.getByRole('group', { name: 'ויטמינים ומינרלים שצרכת היום' });
const vitaminRows = async () => {
  if (!(await vitamins().evaluate((d) => d.open))) await vitamins().getByText('ויטמינים ומינרלים שצרכת היום').tap();
  return (await vitamins().innerText()).replace(/\s+/g, ' ');
};
const vitamin = async (name) => Number((await vitaminRows()).match(new RegExp(`${name}(?: ✓ הושג| מעל היעד)? ([\\d.]+) /`))[1]);
// The on-screen keyboard (about half a phone screen). Headless Chromium has none, so the page shrinks to what's left
// above it, which is what Android does once the page asks for it (interactive-widget=resizes-content); otherwise
// the keyboard just covers the bottom and nothing moves.
const keyboardOpen = async (check) => {
  const full = page.viewportSize();
  const meta = await page.locator('meta[name=viewport]').getAttribute('content');
  assert.match(meta, /interactive-widget=resizes-content/, 'the page asks to shrink above the keyboard, not under it');
  await page.setViewportSize({ ...full, height: 470 });
  try { await check(); } finally { await page.setViewportSize(full); }
};
const sampleJpeg = () => page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 64; return c.toDataURL('image/jpeg').split(',')[1]; });

test('one ＋ opens the add window, with no meal to choose', async () => {
  await openAdd();
  assert.equal(await dialog().getByRole('group', { name: 'ארוחה' }).count(), 0);
});

test('search, pick an amount, add; a fruit counts toward vitamin C', async () => {
  await dialog().getByRole('searchbox', { name: 'חיפוש' }).fill('ענבים');
  // the owner's ask: a result's calories on the name's line, like the usual foods, not under it
  const hit = button(/^ענבים/, dialog()).first();
  const [name, kcal] = await Promise.all([hit.getByText(/^ענבים/).boundingBox(), hit.getByText(/^\d+ קק״ל$/).boundingBox()]);
  assert.ok(Math.abs(kcal.y + kcal.height / 2 - (name.y + name.height / 2)) < name.height / 2, 'calories level with the name');
  await dialog().getByText(/״שלי״ = .* השאר: משרד הבריאות/).waitFor(); // the owner asked which results are hers
  await keyboardOpen(async () => { // the owner's bug: results scrolled under "סיום" and a cut-off row peeked out below it
    const [done, sheet] = await Promise.all([button('סיום', dialog()).boundingBox(), dialog().boundingBox()]);
    const under = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.textContent ?? '',
      [done.x + done.width / 2, (done.y + done.height + sheet.y + sheet.height) / 2]);
    assert.doesNotMatch(under, /ענבים/, 'no result shows below "סיום"');
  });
  await hit.tap();
  // and once picked, the amount's calories sit on the name's line too, above the amount box
  const [title, total] = await Promise.all([dialog().getByRole('heading', { name: /^ענבים/ }).boundingBox(), dialog().getByText(/^\d+ קק״ל$/).boundingBox()]);
  assert.ok(Math.abs(total.y + total.height / 2 - (title.y + title.height / 2)) < title.height / 2, 'the amount\'s calories level with the name');
  await keyboardOpen(async () => { // the owner's bug: the amount's keyboard hid "הוסף" until it was closed
    const box = await button('הוסף', dialog()).boundingBox();
    assert.ok(box.y + box.height <= page.viewportSize().height, '"הוסף" shows above the keyboard');
  });
  await button('הוסף', dialog()).tap();
  await button(/^סיום · נוספו 1/, dialog()).tap();
  await dialog().waitFor({ state: 'detached' });
  assert.equal(await entries('ארוחת צהריים').count(), 1); // lunchtime: filed under lunch
  assert.equal(await button('שמור כארוחה', meal('ארוחת צהריים')).count(), 0); // one food isn't a saved meal: it's one tap in "הרגילים שלך"
  assert.ok((await vitamin('ויטמין C')) > 0, 'the grapes, the day\'s only food, give vitamin C (MoH data)');
  await vitamins().getByText('ויטמינים ומינרלים שצרכת היום').tap();
});

test('in the evening, a photo goes to the review list', async () => {
  await at('19:00');
  await openAdd();
  // any real image will do: test mode answers every photo with the same sample meal
  assert.ok(await dialog().getByLabel('צילום', { exact: true }).count()); // the camera has its own button
  // the gallery picks several photos at once; one is taken back
  const jpeg = Buffer.from(await sampleJpeg(), 'base64');
  await dialog().getByLabel('מהגלריה').setInputFiles([{ name: 'meal.jpg', mimeType: 'image/jpeg', buffer: jpeg }, { name: 'drink.jpg', mimeType: 'image/jpeg', buffer: jpeg }]);
  const picked = dialog().getByRole('list', { name: 'התמונות שנבחרו' }).getByRole('img');
  assert.equal(await picked.count(), 2);
  await button('הסר תמונה 2', dialog()).tap();
  assert.equal(await picked.count(), 1);
  // the photo waits for an optional note (what a photo can't tell), then it's read
  await dialog().getByRole('textbox', { name: /^הערה/ }).fill('גבינה בולגרית מגורדת');
  await button('זהה מזונות', dialog()).tap();
  // while it's being read: a visible status, and the rest locked with the reason given
  await dialog().getByRole('status').filter({ hasText: 'מזהה מזונות בתמונה' }).waitFor();
  // the note stays in view, not the empty box's example
  assert.equal(await dialog().getByRole('textbox', { name: /^מה אכלת/ }).inputValue(), 'גבינה בולגרית מגורדת');
  const next = button('המשך לבדיקה', dialog());
  assert.ok(await next.isDisabled());
  assert.equal(await page.locator(`#${await next.getAttribute('aria-describedby')}`.replace(/:/g, '\\:')).innerText(), 'אפשר להמשיך כשהזיהוי יסתיים');
  await dialog().getByRole('combobox', { name: 'מזון' }).first().waitFor();
});

test('add what the photo missed, then add all to the chosen meal', async () => {
  // a fat the photo can only guess is marked as a guess; this meal had none, so it's removed
  const oil = dialog().getByText(/^ניחוש: שמן או רוטב/);
  assert.equal(await oil.count(), 1);
  // the guide's article on it opens over the list; back closes only the article
  await button('למה תמונה מפספסת שמן?', dialog()).tap();
  const why = page.getByRole('dialog', { name: 'למה תמונה מפספסת קלוריות' });
  await why.waitFor();
  await page.keyboard.press('Escape');
  await why.waitFor({ state: 'detached' });
  assert.equal(await oil.count(), 1);
  await button('הסר: שמן זית, 1 כף', dialog()).tap();
  assert.equal(await oil.count(), 0);
  const foods = dialog().getByRole('combobox', { name: 'מזון' });
  const rows = await foods.count();
  // the photo got a food wrong and the matches don't have it: search the whole database instead
  await foods.first().selectOption('?');
  await dialog().getByRole('searchbox', { name: 'חיפוש מזון אחר' }).fill('גבינה בולגרית');
  await dialog().getByRole('button', { name: /^גבינה בולגרית/ }).first().tap();
  assert.match(await foods.first().evaluate((s) => s.selectedOptions[0].text), /^גבינה בולגרית/);
  await dialog().getByRole('textbox', { name: 'הוספת מזון לרשימה' }).fill('פיתה');
  await button('הוסף', dialog()).tap();
  assert.equal(await foods.count(), rows + 1);
  assert.match(await foods.last().evaluate((s) => s.selectedOptions[0].text), /^פיתה, פיתה ביס/);
  // typing shows matching foods to pick from, keeping the amount typed
  await dialog().getByRole('textbox', { name: 'הוספת מזון לרשימה' }).fill('2 עגבני');
  await button('עגבניה, טריה', dialog()).tap();
  assert.equal(await foods.count(), rows + 2);
  assert.equal(await foods.last().evaluate((s) => s.selectedOptions[0].text), 'עגבניה, טריה');
  assert.equal(await dialog().getByRole('spinbutton', { name: 'כמות' }).last().inputValue(), '2');
  assert.equal(await dialog().getByRole('textbox', { name: 'הוספת מזון לרשימה' }).inputValue(), '');
  await button('הסר: 2 עגבני', dialog()).tap();
  await button(`הוסף (${rows + 1})`, dialog()).tap();
  await at('13:00'); // back to lunchtime, when the diary shows every meal unfolded
  await button(/^סיום/, dialog()).tap();
  await dialog().waitFor({ state: 'detached' });
});

test('a restaurant dish the search doesn\'t know: a question, then its ingredients, logged as the dish', async () => {
  await at('22:00'); // snack time: a meal no other test uses
  await openAdd();
  await dialog().getByRole('searchbox', { name: 'חיפוש' }).fill('מרק תירס');
  await button('זיהוי חכם: ״מרק תירס״', dialog()).tap();
  // words alone: a line saying it's being read, not the big photo frame (the owner thought it wanted a photo)
  const reading = dialog().getByRole('status').filter({ hasText: 'מזהה את המנה…' });
  assert.ok((await reading.boundingBox()).height < 60);
  // where the answer changes the calories a lot, the AI asks first: one tap, pressed until tapped again
  const how = dialog().getByRole('group', { name: 'איך היה המרק?' });
  await how.waitFor();
  await button('סמיך ושמנתי', how).tap();
  assert.equal(await button('סמיך ושמנתי', how).getAttribute('aria-pressed'), 'true');
  assert.equal(await button('צלול', how).getAttribute('aria-pressed'), 'false');
  await button('המשך', dialog()).tap();
  // no database food is that soup, so it comes back as its ingredients, each matched and editable
  await dialog().getByText('״מרק תירס״ לא נמצא במאגר, אז פירקנו אותו למרכיבים. אפשר לתקן כל אחד; ביומן הוא יופיע בשורה אחת בשמו.').waitFor();
  const foods = dialog().getByRole('combobox', { name: 'מזון' });
  assert.equal(await foods.count(), 3);
  assert.match(await foods.first().evaluate((s) => s.selectedOptions[0].text), /^תירס/);
  const kcal = parseInt(await dialog().getByText(/^\d+ קק״ל$/).last().innerText()); // the list's total
  // the owner's ask: the ingredients go in as one line under the dish's name, their calories added up
  await button('הוסף (1)', dialog()).tap();
  await button(/^סיום/, dialog()).tap();
  await dialog().waitFor({ state: 'detached' });
  await at('13:00');
  const soup = button('מחק: מרק תירס', meal('נשנושים ואחר'));
  assert.equal(await entries('נשנושים ואחר').count(), 1);
  assert.match(await meal('נשנושים ואחר').innerText(), new RegExp(`מרק תירס[\\s\\S]*${kcal}`));
  await soup.tap(); // gone again, so the later tests' days are as before
  await page.waitForFunction(() => !document.querySelector('[aria-label="מחק: מרק תירס"]'));
});

test('the meal photo is kept with the meal; a backup carries it; delete, then restore it', async () => {
  const photo = button('תמונה 1: ארוחת ערב', meal('ארוחת ערב'));
  await photo.tap();
  assert.ok(await dialog().getByRole('img', { name: 'הארוחה שצולמה' }).isVisible());
  await button('סגור', dialog()).tap();
  // the backup file holds the photo itself
  await button(/הגדרות/).tap();
  const [download] = await Promise.all([page.waitForEvent('download'), button('הורדת גיבוי').tap()]);
  const backup = await readFile(await download.path());
  const { Photo } = JSON.parse(backup.toString());
  assert.equal(Photo.length, 1);
  assert.match(Photo[0].path, /^\d{4}-\d\d-\d\d\/dinner\..+\.jpg$/);
  assert.ok(Photo[0].jpeg.length > 100);
  // delete it, and restoring the backup brings it back
  await button('יומן').tap();
  await photo.tap();
  // the app asks in its own window, not the browser's; cancel keeps it
  await button('מחק תמונה', dialog()).tap();
  await button('ביטול', asked('למחוק את התמונה?')).tap();
  await asked('למחוק את התמונה?').waitFor({ state: 'detached' });
  assert.ok(await page.getByRole('img', { name: 'הארוחה שצולמה' }).isVisible());
  await button('מחק תמונה', dialog()).tap();
  await button('מחק תמונה', asked('למחוק את התמונה?')).tap();
  await asked('למחוק את התמונה?').waitFor({ state: 'detached' });
  await dialog().waitFor({ state: 'detached' });
  assert.equal(await photo.count(), 0);
  await button(/הגדרות/).tap();
  await page.getByLabel('שחזור מגיבוי').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
  await Promise.all([page.waitForEvent('load'), button('שחזור', asked(/^השחזור יחליף/)).tap()]);
  await button('יומן').tap();
  await photo.waitFor();
});

test('the diary shows them under the right meals, with a total', async () => {
  assert.equal(await entries('ארוחת צהריים').count(), 1);
  assert.equal(await entries('ארוחת ערב').count(), 5); // 4 from the sample photo + the pita
  assert.ok(await page.getByText(/^נצרכו/).isVisible());
  assert.doesNotMatch(await page.getByText(/^נצרכו/).locator('..').innerText(), /נצרכו\s*0\b/);
  // the two daily goals: protein a minimum to reach, carbs a limit to stay under; fat is left to Reports
  const summary = page.getByRole('region', { name: 'סיכום היום' });
  // not tailored yet: the nutrition-label defaults, marked as general, with a way to tailor them
  assert.match(await summary.innerText(), /חלבון[\s\S]*\/ לפחות 50 ג׳[\s\S]*פחמימות[\s\S]*\/ עד 275 ג׳/);
  assert.ok(await summary.getByText(/^יעדים כלליים/).isVisible());
  assert.match(await summary.innerText(), /פחמימות[\s\S]*שומן[\s\S]*\/ 78 ג׳/); // fat last, for reference
  // where the goals come from, with the guidance tables
  await page.getByText('איך נקבעו היעדים?').tap();
  assert.equal(await summary.getByRole('table').count(), 2);
  await button('עוד על פחמימות וקטו', summary).tap(); // the guide's article, from where the question comes up
  const carbs = page.getByRole('dialog', { name: 'פחמימות: 130 גרם, דל פחמימות וקטו' });
  await carbs.waitFor();
  await page.keyboard.press('Escape');
  await carbs.waitFor({ state: 'detached' });
  await page.getByText('איך נקבעו היעדים?').tap();
});

test('tap an entry to change its amount and meal', async () => {
  await button(/^ענבים/, meal('ארוחת צהריים')).tap();
  await dialog().waitFor();
  await mealTab('ערב').tap();
  await dialog().getByRole('spinbutton').first().fill('20');
  await button('שמור', dialog()).tap();
  await dialog().waitFor({ state: 'detached' });
  assert.equal(await entries('ארוחת צהריים').count(), 0);
  assert.equal(await entries('ארוחת ערב').count(), 6);
  assert.equal(await button(/^ענבים/, meal('ארוחת ערב')).filter({ hasText: /\b20 / }).count(), 1); // the photo had grapes too
});

test('delete an entry, then undo', async () => {
  await entries('ארוחת ערב').first().tap();
  assert.equal(await entries('ארוחת ערב').count(), 5);
  await button('בטל').tap();
  await page.waitForFunction(() => document.querySelectorAll('[aria-label^="מחק: "]').length === 6);
});

test('save a meal, then add it again in one tap', async () => {
  await button('שמור כארוחה', meal('ארוחת ערב')).tap();
  await asked('שמירה כארוחה').getByRole('textbox', { name: 'שם הארוחה' }).fill('ערב קבוע');
  await button('שמור', asked('שמירה כארוחה')).tap();
  await page.getByText('"ערב קבוע" נשמרה').waitFor();
  // six foods logged once, just now, at breakfast: the newest, but grapes (twice) has been logged more
  await at('08:00');
  await openAdd();
  await button('כתיבה', dialog()).tap();
  await dialog().getByRole('textbox', { name: /^מה אכלת/ }).fill('מלפפון, עגבניה, גזר, תפוח, בננה, חסה');
  await button('המשך לבדיקה', dialog()).tap();
  await button(/^הוסף \(6\)/, dialog()).tap();
  await button(/^סיום/, dialog()).tap();
  await dialog().waitFor({ state: 'detached' });
  await at('22:00');
  await openAdd();
  // one list of foods and saved meals, the most logged first, not the newest
  const usual = dialog().getByRole('region', { name: 'הרגילים שלך' });
  const rows = usual.getByRole('button', { name: /^הוסף: |\(ארוחה שמורה\)/ }); // a food's ＋, or a saved meal
  const names = () => rows.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') ?? b.textContent));
  for (let i = 0; !(await names())[0]?.includes('ענבים'); i++) { assert.ok(i < 50, 'grapes never came first'); await page.waitForTimeout(100); } // the month loads after opening
  // 10 shown, the rest behind "עוד"; the saved meal is among them, marked as one
  assert.equal(await rows.count(), 10);
  await button(/^עוד \d/, usual).tap();
  assert.ok(await rows.count() > 10);
  assert.equal(await dialog().getByRole('region', { name: 'ארוחות שמורות' }).count(), 0);
  await button(/^ערב קבוע \(ארוחה שמורה\)/, usual).tap();
  await button(/^סיום · נוספו 6/, dialog()).tap();
  await dialog().waitFor({ state: 'detached' });
  assert.equal(await entries('נשנושים ואחר').count(), 6);
  await at('13:00');
});

test('a usual food: ＋ adds last time\'s amount; its name opens the amount picker, filled with it', async () => {
  await openAdd();
  const usual = dialog().getByRole('region', { name: 'הרגילים שלך' });
  const grapes = button(/^ענבים/, usual);
  const amount = async () => (await grapes.innerText()).split('\n')[1].split(' ')[0]; // the amount line under the name
  const last = await amount();
  await grapes.tap();
  const qty = dialog().getByRole('spinbutton');
  assert.equal(await qty.inputValue(), last);
  await qty.fill(String(Number(last) * 2));
  await button('הוסף', dialog()).tap();
  const plus = button(/^הוסף: ענבים/, usual);
  assert.equal(await plus.getAttribute('aria-pressed'), 'true'); // back on the list, marked as added
  assert.equal(await amount(), String(Number(last) * 2)); // showing the amount just added
  await plus.tap(); // a second tap takes it back out
  await page.waitForFunction(() => document.querySelector('[aria-label^="הוסף: ענבים"]')?.getAttribute('aria-pressed') === 'false');
  await button('סיום', dialog()).tap();
  await dialog().waitFor({ state: 'detached' });
  assert.equal(await entries('ארוחת צהריים').count(), 0);
});

test('the day\'s quick add: one tap adds the usual amount to the meal of the time of day, בטל takes it back', async () => {
  const quick = page.getByRole('region', { name: 'הוספה מהירה' });
  const first = quick.getByRole('button').first();
  const name = (await first.innerText()).split(/[,\n]/)[0]; // the name's head, as the toast shows it
  const before = await entries('ארוחת צהריים').count();
  await first.tap(); // 13:00: lunch
  await page.getByRole('status').filter({ hasText: `נוסף ״${name}״ לצהריים` }).waitFor();
  assert.ok(await entries('ארוחת צהריים').count() > before);
  await button('בטל', page.getByRole('status').filter({ hasText: 'נוסף' })).tap();
  await page.waitForFunction((n) => document.querySelectorAll('[aria-label="ארוחת צהריים"] [aria-label^="מחק: "]').length === n, before);
  assert.equal(await dialog().count(), 0); // no window: that's the point
  await button('יום קודם').tap();
  assert.equal(await quick.count(), 0); // today only
  await button('יום הבא').tap();
});

test('what fits in what\'s left: today only, the usual things that fit, one tap each', async () => {
  const ask = button(/^מה נכנס ב־\d+ קק״ל\?$/);
  // over the goal (2022 of 2000): nothing to ask; taking out snack foods (the saved meal again) until it asks
  assert.match(await page.getByRole('region', { name: 'סיכום היום' }).innerText(), /חריגה/);
  assert.equal(await ask.count(), 0);
  for (let n = 6; !(await ask.count()); n--) {
    assert.ok(n > 0, 'never asked');
    await entries('נשנושים ואחר').first().tap();
    await page.waitForFunction((n) => document.querySelectorAll('[aria-label^="מחק: "]').length === 12 + n - 1, n);
  }
  const left = Number((await ask.innerText()).match(/\d+/)[0]);
  await ask.tap();
  const fits = dialog().getByRole('region', { name: /^מה נכנס ב־\d+ קק״ל שנותרו$/ });
  const rows = fits.getByRole('button', { name: /^הוסף: |\(ארוחה שמורה\)/ });
  await rows.first().waitFor(); // the month loads after opening
  // each row's calories: the last line of its name button (a food's ＋ is named "הוסף: …" and has no text)
  const kcal = () => fits.getByRole('button').evaluateAll((bs) => bs.filter((b) => !b.getAttribute('aria-label') && b.innerText.includes('\n'))
    .map((b) => Number(b.innerText.trim().split('\n').at(-1))));
  const all = await kcal();
  assert.ok(all.length > 0 && all.length === await rows.count() && all.length <= 5, `${all}`);
  assert.ok(all.every((n) => n > 0 && n <= left), `${all} should all fit in ${left}`);
  assert.ok(await fits.getByText(/קודם מה שעשיר בחלבון/).isVisible()); // protein still under its 50 g
  // one tap adds it at the usual amount; what's left drops by it, and the row stays to take it back
  const first = rows.first();
  await first.tap();
  await page.waitForFunction(() => document.querySelector('[aria-pressed="true"]'));
  assert.equal(await first.getAttribute('aria-pressed'), 'true');
  await fits.getByRole('heading', { name: `מה נכנס ב־${left - all[0]} קק״ל שנותרו` }).waitFor();
  await first.tap();
  await fits.getByRole('heading', { name: `מה נכנס ב־${left} קק״ל שנותרו` }).waitFor();
  // and back to the whole usual list
  await button('כל הרגילים', fits).tap();
  assert.ok(await dialog().getByRole('region', { name: 'הרגילים שלך' }).isVisible());
  await button('סיום', dialog()).tap();
  await dialog().waitFor({ state: 'detached' });
  // past days don't ask
  await button('יום קודם').tap();
  await page.getByText('היום', { exact: true }).waitFor({ state: 'detached' });
  assert.equal(await button(/^מה נכנס ב־/).count(), 0);
  await button('יום הבא').tap();
  await page.getByText('היום', { exact: true }).waitFor();
});

test('water: a glass at a time on its own line, not under a meal', async () => {
  const water = page.getByRole('group', { name: 'מים' });
  const amount = () => water.getByRole('status').innerText();
  assert.match(await amount(), /^0 \/ 2 ליטר$/);
  assert.ok(await button('פחות כוס מים', water).isDisabled()); // nothing to take back yet
  await button('עוד כוס מים', water).tap();
  await button('עוד כוס מים', water).tap();
  await water.getByRole('status').filter({ hasText: /^0\.5 \// }).waitFor();
  assert.equal(await entries('ארוחת צהריים').count(), 0); // logged at lunchtime, but not listed as lunch food
  // water in the quick add is a glass, and says so (the owner's asks: it said "לצהריים", then repeated the last amount)
  await openAdd(); // her way in: water found by search ("מים ללא פירוט נוסף"), then one tap in the quick add
  await dialog().getByRole('searchbox', { name: 'חיפוש' }).fill('מים');
  await button(/^מים ללא פירוט נוסף/, dialog()).first().tap();
  await dialog().getByRole('spinbutton').first().fill('2'); // not a glass's amount, so the quick add can't just repeat it
  await button('הוסף', dialog()).tap();
  await button(/^סיום · נוספו 1/, dialog()).tap();
  await dialog().waitFor({ state: 'detached' });
  await button('יום קודם').tap(); await button('יום הבא').tap(); // the quick add reloads the month with the water
  const drunk = await amount(), liters = (s) => Number(s.split(' ')[0]);
  await button(/^מים ללא פירוט נוסף/, page.getByRole('region', { name: 'הוספה מהירה' })).tap();
  const toast = page.getByRole('status').filter({ hasText: /^נוספה כוס מים/ });
  await toast.waitFor();
  await page.waitForFunction((was) => document.querySelector('[role=group][aria-label="מים"] [role=status]').innerText !== was, drunk);
  assert.equal(Math.round((liters(await amount()) - liters(drunk)) * 1000), 250); // one glass, 250 ml
  assert.equal(await entries('ארוחת צהריים').count(), 0);
  await button('בטל', toast).tap();
  await water.getByRole('status').filter({ hasText: drunk }).waitFor();
  while (await button('פחות כוס מים', water).isEnabled()) await button('פחות כוס מים', water).tap();
  await water.getByRole('status').filter({ hasText: /^0 \// }).waitFor();
});

test('moving between days', async () => {
  await button('יום קודם').tap();
  await page.getByText('היום', { exact: true }).waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('button', { name: /^מחק: / }).count(), 0); // yesterday is empty
  await button('יום הבא').tap();
  await page.getByText('היום', { exact: true }).waitFor();
  assert.equal(await entries('ארוחת ערב').count(), 6);
});

test('deleting a meal\'s last food takes its photos too (two of them), and undo brings them back', async () => {
  await button('יום קודם').tap();
  await openAdd();
  // a second photo of the same meal, added on the note screen: both are kept with the meal
  await dialog().getByLabel('מהגלריה').setInputFiles({ name: 'meal.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await sampleJpeg(), 'base64') });
  await dialog().getByLabel('עוד מהגלריה').setInputFiles({ name: 'drink.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await sampleJpeg(), 'base64') });
  await button('זהה מזונות', dialog()).tap();
  await button(/^הוסף \(/, dialog()).tap();
  await button(/^סיום/, dialog()).tap();
  const photo = button('תמונה 1: ארוחת צהריים', meal('ארוחת צהריים'));
  const second = button('תמונה 2: ארוחת צהריים', meal('ארוחת צהריים'));
  await second.waitFor();
  const foods = entries('ארוחת צהריים');
  while (await foods.count() > 1) { await foods.first().tap(); assert.equal(await photo.count(), 1); } // not the last: the photo stays
  await foods.first().tap();
  await page.getByRole('status').filter({ hasText: 'נמחק עם תמונות הארוחה' }).waitFor();
  assert.equal(await photo.count(), 0);
  await button('בטל').tap();
  await second.waitFor();
  assert.equal(await foods.count(), 1);
  // without undo it's gone for good: still gone after a reload
  await foods.first().tap();
  await page.getByRole('status').filter({ hasText: 'נמחק' }).waitFor({ state: 'detached', timeout: 10_000 });
  await page.reload();
  await button('יום קודם').tap();
  await meal('ארוחת צהריים').getByText('עוד לא נרשם כלום').waitFor();
  assert.equal(await photo.count(), 0);
  await button('יום הבא').tap();
});

test('moving a meal\'s last food to another meal takes its photo along', async () => {
  await button('יום קודם').tap();
  await openAdd();
  await dialog().getByLabel('מהגלריה').setInputFiles({ name: 'meal.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await sampleJpeg(), 'base64') });
  await button('זהה מזונות', dialog()).tap();
  await button(/^הוסף \(/, dialog()).tap();
  await button(/^סיום/, dialog()).tap();
  const atLunch = button('תמונה 1: ארוחת צהריים', meal('ארוחת צהריים'));
  const atDinner = button('תמונה 1: ארוחת ערב', meal('ארוחת ערב'));
  await atLunch.waitFor();
  const foods = entries('ארוחת צהריים');
  for (let n = await foods.count(); n > 0; n--) {
    const name = (await foods.first().getAttribute('aria-label')).replace(/^מחק: /, '');
    await meal('ארוחת צהריים').getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).first().tap();
    await mealTab('ערב').tap();
    await button('שמור', dialog()).tap();
    await dialog().waitFor({ state: 'detached' });
    if (n > 1) assert.equal(await atLunch.count(), 1); // other food is still at lunch: the photo stays
  }
  await atDinner.waitFor();
  assert.equal(await atLunch.count(), 0);
  // and it's really moved: still at dinner after a reload
  await page.reload();
  await button('יום קודם').tap();
  await atDinner.waitFor();
  await button('יום הבא').tap();
});

test('the phone back button closes a window, and returns from the reports tab to the diary', async () => {
  await openAdd();
  await page.keyboard.press('Escape'); // the same close request Android's back gesture sends
  await dialog().waitFor({ state: 'detached' });
  await button(/דוחות/).tap();
  assert.ok(await button(/CSV/).isEnabled()); // reports opened, and today's entries are in range
  await page.goBack();
  await button(/הוספה$/).waitFor();
});

test('the foods page, from Settings: search first, then my foods and saved meals; the database only through search', async () => {
  assert.equal(await page.getByRole('navigation').getByRole('button', { name: /מזונות/ }).count(), 0); // not in the bar
  await openFoods();
  const mine = page.getByRole('region', { name: /^המזונות שלי/ });
  assert.ok(await mine.getByText('מזונות שתוסיפו או תערכו יופיעו כאן.').isVisible());
  assert.ok(await page.getByRole('region', { name: /^ארוחות שמורות/ }).getByText('ערב קבוע').isVisible());
  // a food of my own shows under "המזונות שלי", and is marked "שלי" in search
  await button('מזון חדש', mine).tap();
  await dialog().getByRole('textbox', { name: 'שם' }).fill('מסטיק בדיקה');
  await button(/מלא אפסים/, dialog()).tap();
  await button('שמור', dialog()).tap();
  await dialog().waitFor({ state: 'detached' });
  await mine.getByRole('button', { name: 'הוסף ליומן: מסטיק בדיקה' }).waitFor();
  const grapes = page.getByRole('button', { name: /^הוסף ליומן: ענבים/ });
  assert.equal(await grapes.count(), 0); // the database stays closed until a search
  const search = page.getByRole('searchbox', { name: 'חיפוש במאגר' });
  await search.fill('ענבים');
  await grapes.first().waitFor();
  assert.equal(await page.getByRole('region', { name: /^המזונות שלי/ }).count(), 0); // while searching, only results
  await search.fill('מסטיק בדיקה');
  assert.ok(await page.getByText('שלי', { exact: true }).first().isVisible());
  // rows show just the name; tapping it opens the values and the edit buttons
  const edit = button('עריכה: מסטיק בדיקה');
  assert.ok(!(await edit.isVisible()));
  await page.getByText('מסטיק בדיקה', { exact: true }).tap();
  await edit.waitFor();
  await search.fill('');
  // one tap on a saved meal adds it to today, at the meal of the time of day (lunch); "בטל" takes it back
  const regular = page.getByRole('button', { name: 'הוסף ליומן: ערב קבוע' });
  await regular.tap();
  await page.getByRole('status').filter({ hasText: '״ערב קבוע״ נוסף לארוחת צהריים' }).waitFor();
  await regular.tap();
  await button('בטל', page.getByRole('status').filter({ hasText: 'ערב קבוע' })).tap();
  await button('יומן').tap();
  assert.equal(await entries('ארוחת צהריים').count(), 6); // added once, the second add undone
});

test('the guide: a tab in the bar, an article with its sources; back closes it, back again returns to the diary', async () => {
  // the day's vitamins link to the article on daily values
  await vitaminRows();
  await button('מה זה ערך יומי?', vitamins()).tap();
  const dv = page.getByRole('dialog', { name: 'ויטמינים ומינרלים: מה זה "ערך יומי"' });
  await dv.waitFor();
  await page.keyboard.press('Escape');
  await dv.waitFor({ state: 'detached' });
  await page.getByRole('navigation').getByRole('button', { name: 'מדריך' }).tap();
  await page.getByRole('heading', { name: 'מדריך', level: 1 }).waitFor();
  await button(/^למה תמונה מפספסת קלוריות/).tap();
  const article = page.getByRole('dialog', { name: 'למה תמונה מפספסת קלוריות' });
  await article.getByRole('heading', { name: 'מקורות' }).waitFor();
  assert.ok(await article.getByText('מידע כללי, לא ייעוץ רפואי.').isVisible());
  // a source opens in a new tab, and says so to screen readers
  const source = article.getByRole('link', { name: /^ScienceDaily.*\(נפתח בלשונית חדשה\)$/ });
  assert.equal(await source.getAttribute('target'), '_blank');
  assert.match(await source.getAttribute('rel'), /noopener/);
  await page.keyboard.press('Escape'); // the phone's back gesture
  await article.waitFor({ state: 'detached' });
  await button(/^מה זו קלוריה/).waitFor(); // still on the guide
  await page.goBack();
  await button(/הוספה$/).waitFor();
});

test('a supplement from its label: every vitamin per tablet, logged, and summed in the day', async () => {
  const before = {};
  for (const name of ['ויטמין D', 'ויטמין C', 'ברזל', 'מגנזיום', 'אבץ']) before[name] = await vitamin(name);
  await vitamins().getByText('ויטמינים ומינרלים שצרכת היום').tap();
  await openAdd();
  // the label button opens the camera; test mode reads any photo as a multivitamin's label, values per tablet
  await dialog().getByLabel('תווית').setInputFiles({ name: 'label.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(await sampleJpeg(), 'base64') });
  await dialog().getByRole('status').filter({ hasText: 'נקרא מהתווית' }).waitFor();
  assert.equal(await dialog().getByRole('textbox', { name: 'שם המוצר' }).inputValue(), 'מולטי ויטמין');
  assert.ok(await dialog().getByText('הערכים לטבליה אחת:').isVisible());
  // "עריכה" opens the full form, filled in; closing it comes back to the check
  await button('עריכה', dialog()).tap();
  assert.equal(await dialog().getByRole('spinbutton', { name: 'ויטמין D (מק״ג)' }).inputValue(), '25');
  await page.keyboard.press('Escape');
  await button('המשך', dialog()).waitFor();
  await button('עריכה', dialog()).tap();
  assert.equal(await dialog().getByRole('spinbutton', { name: 'ויטמין D (מק״ג)' }).inputValue(), '25');
  assert.equal(await dialog().getByRole('spinbutton', { name: 'ברזל (מ״ג)' }).inputValue(), '14');
  // one the label missed can be added by hand
  await dialog().getByRole('combobox', { name: 'ויטמין או מינרל נוסף' }).selectOption('מגנזיום (מ״ג)');
  await dialog().getByRole('spinbutton', { name: 'מגנזיום (מ״ג)' }).fill('50');
  await button('שמור', dialog()).tap();
  // then straight to the amount, 2 tablets: calories and macros only, no vitamins while adding
  await dialog().getByRole('spinbutton').first().fill('2');
  assert.doesNotMatch(await dialog().innerText(), /ויטמין D/);
  await button('הוסף', dialog()).tap();
  await button(/^סיום/, dialog()).tap();
  await dialog().waitFor({ state: 'detached' });
  // the day's vitamins are folded away until asked for, then a row each against the label's daily value,
  // the 2 tablets added on top of what the food already had
  assert.doesNotMatch(await vitamins().innerText(), /ויטמין D/);
  const rows = await vitaminRows();
  for (const row of [/נתרן מעל היעד \d+ \/ עד 2300 מ״ג/, /B12 ✓ הושג [\d.]+ \/ 2.4 מק״ג/, /ויטמין D ✓ הושג [\d.]+ \/ 20 מק״ג/, /ויטמין C ✓ הושג [\d.]+ \/ 90 מ״ג/,
    /ברזל ✓ הושג [\d.]+ \/ 18 מ״ג/, /אשלגן ✓ הושג [\d.]+ \/ 2600 מ״ג/, /מגנזיום [\d.]+ \/ 420 מ״ג/, /אבץ ✓ הושג [\d.]+ \/ 11 מ״ג/]) assert.match(rows, row);
  assert.match(rows, /ויטמין D[\s\S]*ויטמין C[\s\S]*ברזל[\s\S]*מגנזיום[\s\S]*אבץ/);
  for (const [name, tablets] of Object.entries(before)) assert.equal(Math.round(((await vitamin(name)) - tablets) * 100) / 100, { 'ויטמין D': 50, 'ויטמין C': 160, 'ברזל': 28, 'מגנזיום': 100, 'אבץ': 20 }[name], name);
  // a row opens which foods gave it, what it does and how its goal was set; back closes it
  await button(/^ויטמין D/, vitamins()).tap();
  const d = page.getByRole('dialog', { name: 'ויטמין D' });
  await d.getByRole('row', { name: /מולטי ויטמין 50/ }).waitFor();
  for (const h of ['ממה הגיע היום', 'למה זה חשוב', 'איך נקבע היעד']) await d.getByRole('heading', { name: h }).waitFor();
  await page.keyboard.press('Escape');
  await d.waitFor({ state: 'detached' });
  // sodium says it in salt, too
  await button(/^נתרן/, vitamins()).tap();
  await page.getByRole('dialog', { name: 'נתרן' }).getByText(/מ״ג נתרן הם כ־[\d.]+ ג׳ מלח/).waitFor();
  await page.keyboard.press('Escape');
  // and a food's own, per tablet, when it is opened in the foods page
  await openFoods();
  const mine = page.getByRole('region', { name: /^המזונות שלי/ });
  await mine.getByText('מולטי ויטמין').tap();
  await mine.getByText('ויטמין D 25 מק״ג').waitFor();
  await button('יומן').tap();
});


test('a new food: calories that don\'t fit its macros, or a food you have, ask first; the label photo stays with the food', async () => {
  await openFoods();
  const mine = page.getByRole('region', { name: /^המזונות שלי/ });
  const form = (title = 'מזון חדש') => page.getByRole('dialog', { name: title });
  const warn = asked('לשמור בכל זאת?');
  const fill = async (name, kcal) => {
    await form().getByRole('textbox', { name: 'שם' }).fill(name);
    for (const [field, x] of [['קלוריות', kcal], ['פחמימות (ג׳)', 1.5], ['שומן (ג׳)', 5], ['חלבון (ג׳)', 11]]) await form().getByRole('spinbutton', { name: field }).fill(String(x));
    await button('שמור', form()).tap();
  };
  // the owner's cottage cheese, its sodium (350) read as calories: 11 g protein, 5 g fat and 1.5 g carbs make 95
  await button('מזון חדש', mine).tap();
  await fill('קוטג׳ בדיקה', 350);
  await warn.getByText(/350 קלוריות לא מתאימות .* בערך 95/).waitFor();
  await button('ביטול', warn).tap();
  assert.ok(await form().isVisible()); // back in the form, to fix it
  await button('שמור', form()).tap();
  await button('שמור בכל זאת', warn).tap();
  await form().waitFor({ state: 'detached' });
  // the same numbers under another name: it's the food you have
  await button('מזון חדש', mine).tap();
  await fill('קוטג קטן', 350);
  await warn.getByText(/כבר יש לך ״קוטג׳ בדיקה״/).waitFor();
  await button('ביטול', warn).tap();
  await button('סגור', form()).tap();
  assert.equal(await mine.getByText('קוטג קטן').count(), 0);
  // a saved meal is two foods or more
  await button('ארוחה חדשה').tap();
  const editor = page.getByRole('dialog', { name: 'ארוחה שמורה חדשה' });
  await editor.getByRole('textbox', { name: 'שם הארוחה' }).fill('בוקר בדיקה');
  const addToMeal = async (q, name) => {
    await editor.getByRole('searchbox', { name: 'הוסף מזון לארוחה' }).fill(q);
    await editor.getByRole('button', { name }).first().tap();
    await button('הוסף לארוחה', editor).tap();
  };
  await addToMeal('קוטג׳ בדיקה', /^קוטג׳ בדיקה/);
  await button('שמור ארוחה', editor).tap();
  await editor.getByText(/לפחות שני מזונות/).waitFor();
  await addToMeal('מלפפון', /^מלפפון/);
  await button('שמור ארוחה', editor).tap();
  await editor.waitFor({ state: 'detached' });
  // fixing the food fixes the meal: 100 g of it, 255 kcal less
  const kcal = async () => Number((await page.getByRole('region', { name: /^ארוחות שמורות/ }).getByText(/^קוטג׳ בדיקה · .* קק״ל$/).innerText()).match(/(\d+) קק״ל/)[1]);
  await page.getByText('בוקר בדיקה', { exact: true }).tap();
  const before = await kcal();
  await mine.getByText('קוטג׳ בדיקה', { exact: true }).tap();
  await button('עריכה: קוטג׳ בדיקה').tap();
  await form('עריכת מזון').getByRole('spinbutton', { name: 'קלוריות' }).fill('95');
  await button('שמור', form('עריכת מזון')).tap();
  await form('עריכת מזון').waitFor({ state: 'detached' }); // no question: the numbers fit
  assert.equal(await kcal(), before - 255);
  // the multivitamin was read from a label: its photo is kept, to check the values against
  await mine.getByText('מולטי ויטמין', { exact: true }).tap();
  await button('עריכה: מולטי ויטמין').tap();
  await form('עריכת מזון').getByText('הטבלה שנסרקה').tap();
  assert.ok(await form('עריכת מזון').getByRole('img', { name: 'טבלת הערכים של מולטי ויטמין' }).isVisible());
  await button('סגור', form('עריכת מזון')).tap();
  await button('יומן').tap();
});

test('settings show the goals first; tailoring is a few steps; a weigh-in in reports only logs', async () => {
  const spin = (name, scope = page) => scope.getByRole('spinbutton', { name });
  const goals = page.getByRole('region', { name: 'היעדים שלך' });
  const weighIn = async (kg, cm) => {
    await button(/דוחות/).tap();
    await spin('משקל היום (ק״ג)').fill(kg);
    await spin(/^מותניים/).fill(cm);
    await button('שמור שקילה').tap();
    await page.getByRole('status').filter({ hasText: 'השקילה נשמרה' }).waitFor();
  };
  const next = () => button('הבא', dialog());
  // a week ago: a weigh-in in Reports, then from the diary's hint to Settings
  await page.clock.setFixedTime(new Date('2026-10-14T09:00:00'));
  await weighIn('76', '90');
  await button('יומן').tap();
  await button('התאמה אישית').tap();
  assert.match(await goals.innerText(), /2000 קק״ל · חלבון 50 ג׳[\s\S]*כלליים/);
  // manual editing warns when the macros don't add up to the calories
  await button('עריכה ידנית', goals).tap();
  await spin('שומן (ג׳)', goals).fill('10');
  assert.ok(await goals.getByText(/^הפחמימות, השומן והחלבון שווים יחד \d+ קק״ל, לא 2000/).isVisible());
  await button('ביטול', goals).tap();
  // tailoring, step by step: what's missing is named; the weight comes from the last weigh-in
  await button('התאמה אישית', goals).tap();
  assert.equal(await spin('משקל (ק״ג)', dialog()).inputValue(), '76');
  assert.ok(await next().isDisabled());
  await spin('גיל', dialog()).fill('45');
  await spin('גובה (ס״מ)', dialog()).fill('165');
  await next().tap();
  await next().tap();
  await dialog().getByRole('radio', { name: 'דל פחמימות: עד 130 ג׳' }).check();
  await next().tap();
  assert.ok(await dialog().getByText(/^1.8 ג׳ × 68.1 ק״ג \(לא 76/).isVisible()); // the protein arithmetic, in her numbers
  await button('השתמש ביעדים האלה', dialog()).tap();
  await dialog().waitFor({ state: 'detached' });
  await page.getByRole('status').filter({ hasText: 'היעדים עודכנו' }).waitFor();
  assert.match(await goals.innerText(), /חלבון 123 ג׳ · פחמימות 130 ג׳[\s\S]*מותאמים/);
  const kcal = async () => Number((await goals.innerText()).match(/(\d+) קק״ל/)[1]);
  const kcalBefore = await kcal();
  // today: a new weigh-in alone keeps the goals; tailoring again follows the new weight
  await page.clock.setFixedTime(new Date('2026-10-21T13:00:00'));
  await weighIn('75', '88');
  await button(/הגדרות/).tap();
  assert.equal(await kcal(), kcalBefore);
  await button('עדכון ההתאמה האישית', goals).tap();
  assert.equal(await spin('משקל (ק״ג)', dialog()).inputValue(), '75');
  for (let i = 0; i < 3; i++) await next().tap();
  await button('השתמש ביעדים האלה', dialog()).tap();
  await dialog().waitFor({ state: 'detached' });
  assert.ok(await kcal() < kcalBefore);
  await button(/דוחות/).tap();
  await button('חודש').tap();
  await page.getByRole('img', { name: /^משקל: מ־76 ק״ג .* ל־75 ק״ג/ }).waitFor();
  await page.getByRole('img', { name: /^מותניים: מ־90 ס״מ .* ל־88 ס״מ/ }).waitFor();
  await button('יומן').tap();
  const summary = page.getByRole('region', { name: 'סיכום היום' });
  assert.match(await summary.innerText(), /\/ לפחות 123 ג׳[\s\S]*\/ עד 130 ג׳/);
  assert.equal(await summary.getByText(/^יעדים כלליים/).count(), 0);
});



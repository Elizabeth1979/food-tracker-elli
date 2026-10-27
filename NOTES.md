# Notes

What was done in each work session and what's next. Newest first.

## 2026-10-27: regular spaghetti, and no olive oil guess on a sauce that has it

**Done:**
- The owner's spaghetti went to "ספגטי, מחיטה מלאה" (whole wheat): it's the database's only "ספגטי", so the AI had no other choice. Now a pasta shape (ספגטי, פנה, פוזילי, מקרוני) also finds plain "פסטה", whole grain comes only when typed, "פסטה" alone is plain cooked pasta (`STAPLES`), cooked-without-oil leads when "מבושל" is typed, and "פסטה מבושלת" no longer gets dry pasta (`searchFoods`).
- Her bolognese was "רוטב בולונז עם שמן זית", and the list still offered "ניחוש: אולי היה גם שמן זית". A guessed fat is now hidden when a picked food already names a fat (`hasFat`; "ללא תוספת שמן" doesn't count). Change the sauce to one without oil and the guess comes back.
- She found the oil guess too wordy: it's now one line (the guess, with its ✕), the "הוסף" button, then the "למה" link.
- Tests: `search.test.ts` (spaghetti, `hasFat`), screen test (spaghetti bolognese: plain pasta, no oil guess, guess back with a sauce without oil).

## 2026-10-27: no buttons while a photo is read

**Done:**
- The owner: while a photo was being read, "זיהוי חכם" and "המשך לבדיקה" still showed (locked), which was confusing. Now only the spinner and the note (locked) show; the buttons come back when it's done (`TextOrPhoto` in `AddDialog.tsx`).
- Screen test: no buttons while the photo is read.

## 2026-10-27: a new size fills in its grams

**Done:**
- The owner added labneh from a label, then a "כף" size, and didn't know its grams. The new-size row now fills them from the same size on the closest MoH food (`unitGuesser` in `search.ts`: the food's name cut from the end until a match has that size), else a typical weight (`FALLBACK_G`), and says where they came from, with the level/heaped variants ("כף שטוחה 12 ג׳, כף גדושה 44 ג׳"). Grams typed by hand are never overwritten.
- Search: a leading "לבנה" means labneh ("לאבנה"); it found white beans. "גבינה לבנה" is unchanged.
- Tests: `search.test.ts` (labneh's spoon, a typical teaspoon), `e2e/screens.mjs` (a known size fills and clears its grams).

**Next:** MoH lists labneh's plain "כף" at 40 g, almost a heaped one (44 g); the hint shows both so the owner can pick.

## 2026-10-27: water and the quick add above the macros

**Done:**
- The owner: the 10-26 move (macros up, quick add down) wasn't what she meant. Day summary order now: ring and "הוספה", water, the quick add (and "מה נכנס"), then what the day gave: calories eaten, macros, vitamins.
- Water has a drop icon, so it reads apart from the foods and the macros.
- Screen test: water above the quick add, the quick add above the macros.

## 2026-10-27: "תה נענע" found whole milk

**Done:**
- The owner wrote "תה נענע" and got "חלב מלא /טבעי, 3.6% שומן, תנובה/שטראוס/יטבתה" (161 kcal a cup). Search logic, not the AI: no food has both words, so the last word was dropped and "תה" was searched; "תה" is inside "יטבתה", and milk, being a recent food, jumped above the real teas. Now a word found only inside another word comes after every whole-word match, even a recent or own food (`inside` in `searchFoods`).
- Tests: `search.test.ts` (recent milk and an own "שוקו יטבתה" don't beat tea).

**Next:** "תה נענע" picks "תה, צמחים" (right calories); mint itself isn't added. Fine for tea; worth watching for other "X Y" dishes where the dropped word matters.

## 2026-10-26: a guessed fat is offered, not added

**Done:**
- The owner typed bread with yellow cheese and the list already held "חמאה, 1 כפית" (37 kcal) she never had. A fat or sauce the AI guesses (`hidden`) is now only offered in the review list: "ניחוש: אולי היה גם …" with a "הוסף: …" button; it isn't counted until tapped (`offer` in `Review.tsx`). Answering the AI's question about it ("כפית") counts as yes; "בלי" drops it as before (`matchMealWith`).
- Trade-off, said to her: the research behind the guess (photo apps miss ~30 g fat a meal) is why it was on by default; the guide article now says the choice is hers and not to skip it without thinking.
- Tests: screen test (the guessed oil isn't counted until "הוסף: שמן זית, 1 כף"); `search.test.ts` (an answer confirms the guess).

## 2026-10-26: star fruit ("כוכבית") is found

**Done:**
- The owner photographed star fruit: the AI named it "כוכבית (קרמבולה)", the search looked for "כוכבית" only and found nothing, so the AI "broke it into ingredients", itself, and the row stayed unmatched. The database has it ("קרמבולה, טרי", 31 kcal/100 g). Now "כוכבית" means "קרמבולה" (`SAME`), and a name with another in parentheses tries each name (`matchFoods`), so any such pair finds the one the database knows ("זוקיני (קישוא)"). Test in `search.test.ts`; case 19 in `docs/meal-photo-cases.md`.
- Her first try named it bread: one photo, so not yet a reason to change model.

- Then: a piece count of a food with no piece size ("3 יחידה" of star fruit, which the database lists by the cup) was logged as 3 grams. Now the photo's weight guess stands (`unitFor`). Test in `search.test.ts`.
- `scripts/compare-models.ts`: runs the `meal-photo` function's own code with Haiku, Sonnet and Opus on photos with known answers, then the app's matching (`matchMealWith`, moved from `lib.ts` to `search.ts` for it), and reports foods, calories, pass/fail, time and cost per photo. Its first (mock) run found the 3-grams bug.

**Next:** she approved the cost and is sending photos. Running it needs `ANTHROPIC_API_KEY` in the cloud environment's settings; then fill the Results table in `docs/meal-photo-cases.md` and pick the model.

## 2026-10-26: the food-estimate spec, built on the database

**Done:**
- The owner brought a spec ("Food estimate, phase 1") where the AI gives each food's nutrients itself. We reviewed it together: the app already has the Israeli database it said was missing (its "Israeli anchors", falafel 269 and egg salad 205, are `moh.json`'s numbers), and the AI's run-to-run spread (14%) is why calories come from the database. Agreed plan: keep the database, build the spec's new ideas on top of it:
  1. **Asking twice:** adding a food (or a dish, by name) already logged that day in the last 30 minutes asks "כבר רשמת … להוסיף שוב?" first, in the app's own window; no on cancel, and a photo's pictures aren't saved either. Water never asks. In code only (`repeatOf` in `search.ts`, from the entry's `created_at`).
  2. **Which one?:** `meal-photo` asks which dish a name means where it matters ("סלט עוף": deli with mayo or green salad with chicken; "קפה עם חלב": נס קפה or הפוך), and the answer decides the pick or the ingredients.
  3. **Typed meals:** a salad, pita, bread or coffee typed without its fat or sugar gets a guessed one marked "ניחוש" and a question; "בלי" drops it (an answer of none comes back as amount 0, and `pickedParsed` drops it). "הכנתי" with ingredients lists each one.
  4. **"הערכת AI"** on a dish the database lacks (logged from its ingredients), in the diary, its details and the review list.
  5. **Vitamin levels:** Reports over two or more logged days says "נמוך" (under 70% of the goal on average) or "סביר" under each vitamin's goal; "✓ הושג" as before at the goal. Not for label-only ones (iodine…), which foods don't list.
- `docs/meal-photo-cases.md`: the spec's 14 cases plus past bugs, each with what to expect, to run against the real model.
- Dropped from the spec: AI nutrient values, the name cache (and its table), sending recent entries and saved dishes to the AI.
- Tests: `search.test.ts` (repeats, "none" drops the item), `goals.test.ts` (levels), screen test (asking twice; which chicken salad; no oil; the levels).

**Next:** the new prompt lines weren't run against the real model (no API key in the cloud session): run `docs/meal-photo-cases.md`, cases 4, 10 and 12 first.

## 2026-10-26: the quick add is hers to choose; macros and water up top; "שלי" in the usual list

**Done:**
- The owner wanted the plain coffee (0 kcal), the tomato and water out of "הוספה מהירה", and her coffee with ghee, cappuccino and the Müller 25 yogurt in. A new "עריכה" next to the heading picks them from her usual things (one tap each, "שמירה"); saved in `profiles.quick` (migration `profiles_quick_add`, with her OK), so every device has it. Nothing picked = automatic: the 6 most usual that have calories.
- Water is out of the quick add and the ＋ window's usual list: it has its own line (the quick add's glass-of-water special case is gone).
- A saved meal now counts as one thing in the usual order: its foods don't count again on their own (her coffee with ghee showed as three rows: the meal, ghee and a 0-kcal coffee).
- Day summary order: ring, then calories and macros, then water, then the quick add and "מה נכנס".
- Usual list (and the quick add's chooser): a food of her own is tagged "שלי", like search results.
- Screen test: choosing the quick add (and back to automatic), the saved meal heading the usual list, no water in either list, the "שלי" tag.

**Next:** she still needs to open "עריכה" once and pick hers. A picked food she hasn't logged in 30 days drops out (no amount on record).

## 2026-10-25: Reports no longer lists each day's foods on screen

**Done:**
- The owner asked what the food list at the bottom of Reports was: each day's foods by meal, the same as the diary. It's now in the PDF only (where a printed report needs it); on screen Reports ends at the vitamins (and the per-day table and chart for longer ranges). One `.print-only` class replaces `.print-title`.
- Screen test: no meal headings in Reports on screen, there in print (fails with the list back on screen).

## 2026-10-25: a new size from the photo's check list too

**Done:**
- The owner asked why a tomato has small/medium/large and a fried potato only "medium": each food's sizes are the ones the Ministry of Health measured. Grams are always there. A missing size could already be added ("＋ יחידה חדשה…") when adding one food, but not in the check list after a photo or typed meal. Now it can; it's saved on the food, like before. One `NewUnit` and `UnitOptions` (`AddDialog.tsx`) serve both windows.
- Screen test: a size added in the check list is picked, and the food's other row has it too (fails without the option).

## 2026-10-25: the meal photo moved from the diary list to the food's details

**Done:**
- The owner found the photo in the diary list in the way: it didn't sit next to any food. The list no longer shows it; tapping any food of that meal opens its details with the photo (tap to enlarge or delete). Photos still belong to the meal: they go or move with its last food, as before. Screen test: no photo in the list, the photo in the details; the delete/undo/move tests count photos through the details (fails with the photo back in the list).

## 2026-10-25: water from the quick add is a glass, and says so

**Done:**
- The owner tapped "מים ללא פירוט נוסף" in the quick add at dinner time and the message said "נוסף ... לערב", though water goes to its own line. Now it says "לשתייה".
- Then: a water tap in the quick add repeated the last amount logged (240 ml cups from search). It now adds one glass (250 ml, like the water line's ＋) and says "נוספה כוס מים". Screen test logs water by search at another amount and checks the tap adds exactly 250 ml. One helper for "added to where" (`placeOf` in `lib.ts`), used by the quick add and the foods page. Screen test: water logged by search, then from the quick add.

## 2026-10-25: "עגבנייה" is found; a photo's note is a big box and stays in view

**Done:**
- The owner's salad note said "שתי כפות של עגבנייה" and the tomato wasn't found: the database spells it "עגבניה" (and has both "לחמניה" and "לחמנייה"). Search now matches with one yod/vav either way (`norm` in `search.ts`), and the parser skips the spoken "של" after an amount. "לחמניה" opens on a white roll and "שניצלים" on a fried chicken breast schnitzel (`STAPLES`). Tests in `search.test.ts`.
- A photo's note is now a 3-line box, and it's the same text as the typed meal, so while the photo is read the note stays in view (it showed the empty box's example). Screen test checks it.
- `meal-photo` prompt: the note is often dictated, so read a misheard word as the food that fits the meal. Redeployed.

**Next:** in the owner's screenshot the AI broke "אפונה" into tomatoes; likely because the tomato had no search matches to pick from (now fixed). Watch whether it recurs.

## 2026-10-25: "זיהוי חכם" on words no longer looks like photo mode

**Done:**
- The owner tapped "זיהוי חכם" from the search and thought it wanted a photo: words being read showed the same big dark photo frame as a photo being read, just empty. `Reading` without a photo is now one status line with a small spinner.
- Screen test: the "reading" status for words is a line, not the frame (fails without the fix).

## 2026-10-25: quick add on the day screen; the gum fixed

**Done:**
- The owner wanted her daily things (the morning coffee) one tap away without the ＋ window. Today's summary now has "הוספה מהירה": the 6 most usual things (same list and order as "הרגילים שלך", only ones with an amount on record), one tap adds last time's amount to the meal of the time of day, a toast with "בטל". The usual-list logic moved into one hook (`useUsual` in `AddDialog.tsx`) used by both; long MoH names show their head (`head` in `lib.ts`), screen readers get the full name. Screen test: tap adds to lunch, בטל removes it, not shown on other days.
- Data (with the owner's OK): her 3 Bazooka entries were the sugared MoH gum (312 kcal/100 g); she chews her own sugar-free one, so they now point to "גומי לעיסה בטעם בזוקה ללא סוכר" (151 kcal less), which leads `profiles.recent`. The six MoH gums (moh-4794..4799) are hidden for her.

**Next:** her own gum's name lacks "מסטיק", so searching "מסטיק" now finds nothing; asked whether to rename it. Her saved meal "קפה" (coffee + 1 tbsp ghee, 88 kcal) is what she logs daily as two entries; the quick row offers it.

## 2026-10-24: each vitamin row opens: which foods, what it does, how its goal was set

**Done:**
- The owner asked where the day's vitamins came from, how their goals were set and what each is for (sodium: she knew there's a daily limit). Each row in "ויטמינים ומינרלים שצרכת היום" is now a button that opens a window: the foods that gave it today (amount and share, the same food added up), "למה זה חשוב" (one or two lines from the NIH fact sheets, `MICRO_INFO` in `goals.ts`), "איך נקבע היעד" (the label value, or why not: sodium, potassium, calcium, iron), and for sodium the same in grams of salt (× 2.54). The article link sits in it too.
- Reports' vitamins card does the same over the range ("ממה הגיע בתקופה").
- Tests: `goals.test.ts` (every nutrient with a daily value has a line), screen test (vitamin D's window lists the multivitamin; sodium says it in salt).

**Next:** the "why" lines are general; no per-person upper-limit warnings yet.

## 2026-10-24: a broken-down dish is one diary line

**Done:**
- At the owner's ask, a dish the database lacks goes into the diary as one line under its name ("מרק תירס, 167 ג׳"), its values the sum of the ingredients as checked in the review list (`dishItem` in `lib.ts`). No food behind it, so editing its amount scales the whole dish, in grams. No database change. Screen test: added at snack time, one line with the list's total, then deleted.

## 2026-10-24: "זיהוי חכם": the AI picks from the database, asks, and breaks down dishes

**Done:**
- The owner: a sushi-bar corn soup came back as a packet soup, and that's not a one-off; any restaurant dish should work. Three parts, agreed with her (the extra AI call costs a few cents a photo, she OK'd it):
  1. The AI picks each food's database entry: after a photo is read, the app sends each item's 10 closest search matches (with kcal/100 g) back to `meal-photo` (`mode: 'pick'`, text only), which picks the one that is this food made this way (restaurant, creamy, not instant). Logic in `search.ts` (`candidatesFor`, `pickedParsed`), calls in `lib.ts` (`readMeal`, `matchMeal`).
  2. A dish the database lacks comes back as ingredients (corn, cream, sugar…), each matched the same way in one more pick round (plain search matched "ציר עוף" to the concentrate). The review list says so above them.
  3. Up to 3 one-tap questions first, only where the answer changes calories by a quarter or more (`Questions` in `AddDialog.tsx`).
- "זיהוי חכם" works with words too: first row of search results, and next to "המשך לבדיקה". The function now takes a meal with no image.
- If a pick fails, the search's own matches stand. Tests: `search.test.ts` (picks), screen test (search → question → ingredients). Test mode answers a soup with a question and ingredients.

**Next:** the prompts weren't run against the real model before going live (no API key in the cloud session); watch the first few photos.

## 2026-10-24: a photo's cooked rice was raw rice, and 3 spoons became 120 g

**Done:**
- The owner's leftover rice came back as "אורז, לבן, לא מבושל" (365 kcal/100 g instead of 130): the typed "מבושל" matched the "מבושל" in "לא מבושל". Search now pushes a food down when its name negates a typed word ("לא " + word); "אורז לא מבושל" still finds raw rice. Test in `search.test.ts`.
- The photo said "3 כף" but 120 g, and the grams won (438 kcal). A weight guess now overrules a unit only when the unit is far heavier (the lettuce-heads case); otherwise the smaller amount stays, as the prompt already asks ("guess the smaller amount"). Test in `search.test.ts`.
- Lettuce leaves: the photo can now answer in "עלה" (leaves) instead of grams, and typing "3 עלים חסה" works. `meal-photo` redeployed.

**Next:** the photo model is Haiku (`claude-haiku-5-5`, unless the `MEAL_PHOTO_MODEL` secret says otherwise). Amount guesses are its weakest part; a bigger model costs more per photo, the owner's call.

## 2026-10-24: several photos for one meal

**Done:**
- The owner asked to pick more than one photo when adding a meal from a photo. The gallery now picks several at once, and the note screen shows them with "הסר תמונה" on each and "עוד צילום" / "עוד מהגלריה" to add more (up to 4, `MAX_PHOTOS`). All go to the `meal-photo` function in one request (`images`), so a food two photos show counts once; all are kept with the meal. The function (v11, deployed) still accepts the old single `image`.
- Screen test: two from the gallery, remove one; a second added on the note screen, both kept with the meal, both go with its last food and come back with undo.

**Next:** each extra photo costs about one more photo's worth of AI tokens per reading, only when used.

## 2026-10-24: a photo's "מרק תירס" is a soup, not a packet

**Done:**
- The owner photographed a restaurant corn soup with the note "מרק תירס"; it came back as Knorr's instant packet soup. The AI did use the note; the database match was wrong: "מוכן מאבקה" / "נמס בכוס" weren't counted as processed ("אבקה" was, "מאבקה" wasn't), so packet soups beat cooked ones for corn, chicken, pea and bean soup. `PROCESSED` now has "מאבקה", "מאבקת", "נמס"; typing them still finds the packets. Test in `search.test.ts`.

**Next:** "מרק תירס" now opens with the egg-drop one (39 kcal/100 g); a creamy restaurant soup is closer to "עם תפוח אדמה וחמאה, חלבי" (61). The review list lets her pick it.

## 2026-10-24: nothing peeks out under "סיום"; which results are yours

**Done:**
- The owner saw a cut-off row under "סיום" while searching "מסטיק": the button stuck to the bottom of the scrolling list, and rows scrolled through the space below it. `Modal` now takes a `footer` that sits under the scrolling body; the add window's "סיום" lives there. Screen test: at keyboard height, no result shows below "סיום" (fails on the old layout).
- They couldn't tell their own foods from the MoH ones. Own and edited foods already carry "שלי" (none of the gums did: all MoH; the Bazooka logged today is first because it was logged). Search results now open with one line saying so (`MINE_HINT`, shared with the foods page), shortened at the owner's ask to fit one line on the phone.

## 2026-10-24: egg whites in search

**Done:**
- The owner couldn't find how to log eggs that were mostly whites. The database has them ("ביצה חלבון", one white 38 g, 20 kcal; "ביצה חלמון", one yolk 19 g), but "חלבונים" and "חלבוני ביצה" found nothing: a cut-off plural ("חלבונ") didn't match a singular ending in a final letter ("חלבון"). `forms` in `search.ts` now tries the final letter too (also "לימונים"), and "חלבונים" means egg whites (`SAME`); "חלבון" alone still lists protein powder first. Test in `search.test.ts`.
- The owner's lunch today still has 2 "ביצה או חביתה מטוגנת ללא שמן" (100 g, 162 kcal, 14.2 g protein); not edited, that's their call.

## 2026-10-24: calories on the name's line (search results, amount window)

**Done:**
- The owner asked for calories on the same line as the food while adding, not below. Search results (add window and the saved-meal editor) are now one shared `FoodHit` row: the name with its calories at the end of the line (per the serving shown below, like the usual foods' number), the macros under it. Screen test: the calories are level with the name.

- Then the amount window too (owner: "yes"): `Amount named` heads it with the food's name and the calories for the typed amount on the same line; the macros stay under the amount box. Used when adding and in the saved-meal editor; editing a logged entry keeps its old line (the window's title is already the name). Screen test: the amount's calories are level with the name.

## 2026-10-24: the keyboard no longer hides "הוסף"

**Done:**
- The owner reported: typing an amount, the phone keyboard covered the "הוסף" button until it was closed. Android's default is to lay the keyboard over the page; `index.html`'s viewport now asks for `interactive-widget=resizes-content`, so the page (and every bottom window) shrinks to the space above the keyboard. Screen test: at a keyboard-open height, "הוסף" is on screen.

**Next:** side effect: on pages with a text field (Settings, Reports) the bottom tab bar now rides above the keyboard too. iPhone Safari ignores the setting (not needed for the owner's Android).

## 2026-10-24: potassium 2600, and "average, not a daily quota"

**Done:**
- At the owner's request the potassium target is 2600 mg (NASEM 2019, women), not the label's 4700 (`DAILY_VALUES`). The day's vitamin note says so. Screen test: the test day's 3394 mg now reaches it (fails with 4700).
- The vitamins article has "ממוצע, לא מכסה יומית": recommendations are averages; A, D, E, K and B12 are stored, so a weekly dose is fine; Reports (week or month) shows the true average.

**Next:** asked the owner whether she takes a weekly supplement, to check it's logged and counted right.

## 2026-10-24: the guide in the bar, and linked from where questions come up

**Done:**
- The owner couldn't find the guide under Settings. "מדריך" is now a tab in the bottom bar (bulb icon); the Settings card is gone. `ArticleLink` in `Guide.tsx` opens one article over the current screen: "מה זה ערך יומי?" under the day's vitamins, "עוד על חלבון" / "עוד על פחמימות וקטו" in "איך נקבעו היעדים?", "למה תמונה מפספסת שמן?" under a photo's guessed oil.
- Bug found by the new test: back on a window opened inside another (the article over the review list) closed both, losing the list. `Modal` now handles only its own close request (React passed the inner one up).
- Screen test: the tab, the three kinds of links, back closing only the article.

## 2026-10-24: two more guide articles: daily values, carbs

**Done:**
- "ויטמינים ומינרלים: מה זה ערך יומי" (what the vitamin rows mean, why a DV is set high, sodium sources disagree, upper limits the app doesn't warn about) and "פחמימות: 130 גרם, דל פחמימות וקטו" (where 130 comes from, the definitions, why keto says "בליווי רופא"). Sources in `docs/research.md`.

**Next:** the owner's call: the potassium target is the label's 4700 mg; the 2019 recommendation is 2600 (women) / 3400 (men). Switching would need sex from the profile.

## 2026-10-23: a guide ("מדריך") and a research log

**Done:**
- Settings → "פתיחת המדריך" opens a guide page (a tab outside the bar, like the foods page): five short Hebrew articles, each opens in a window (back closes it) and ends with linked sources (new tab): calories and 4/4/9 (and the kcalOff warning), reading a label (the cottage cheese scan), protein (the app's 1.8 g/kg at a BMI-25 weight), what photos miss (the NIH study, the guessed-fat row), portions (Tzameret's spoon 10 g vs USDA's 13.5 g).
- Articles are Markdown in `src/articles/`, read by a tiny parser (`src/guide.ts`, headings, paragraphs, lists, bold, https links); `guide.test.ts` checks each has headings, a not-medical-advice line and linked sources last. Screen test: open from Settings, an article, a source link, back twice.
- `docs/research.md`: every source used so far and what it changed. CLAUDE.md points future sessions there.

**Next:** the cloud session can't open most source sites (only search), so numbers were checked through search results; recheck when one matters. `GoalsInfo` says 1.6–2.2 g/kg for strength training; 2.2 wasn't confirmed this time.

## 2026-10-23: "מה נכנס ב־N קק״ל?": what you can still eat today

**Done:**
- The owner asked "what can I eat from my usual foods with the 200 calories left?". Today only, while calories are left, the day summary has "מה נכנס ב־N קק״ל?". It opens the ＋ window on up to 5 of the usual foods and saved meals whose usual amount fits the calories and carbs left (carbs are a limit). While protein is under its goal, the most protein per calorie first; otherwise the most logged first. Each is one tap, like the usual list; what's left updates as you add, and "כל הרגילים" goes back to the full list. If nothing fits it says so and offers the smallest usual food, whose name opens the amount picker for less.
- No AI: same data as the usual list (the past month). Ranking is `whatFits` in `goals.ts` (with `goalsLeft`, used by the day and the window); unit test in `goals.test.ts`. Screen test: hidden while over the goal and on past days; every row fits; a tap lowers what's left and can be taken back.

## 2026-10-23: MoH vitamins and minerals for every food

**Done:**
- The owner opened the environment's network to data.gov.il. `scripts/moh-vitamins.ts` reads the Tzameret table from the data.gov.il API (the CSV download is blocked by its CDN) and adds 19 vitamins and minerals per 100 g to each food in `moh.json` as `extra` (A as RAE, D, E, K, C, B1–B6, folate, iron, magnesium, zinc, selenium, copper, manganese, phosphorus, choline; zeros and unknowns left out). Biotin and iodine are missing for most foods, so they stay label-only. All 4,624 foods matched. `moh.json` is 3.6 MB (456 KB gzipped, was 246 KB).
- `loadFoods`: a food's own row (an added unit, hidden) saved before this keeps the file's vitamins (`extra: o.extra ?? f.extra`).
- The day's rows show every vitamin food carries (`FOOD_VITAMINS`), even at 0. One mandarin = 23 mg vitamin C of 90.
- Entries logged before this carry their own copy of the nutrients, so they have no vitamins; only new ones count.
- Screen test: grapes alone give vitamin C; the supplement adds exactly its 2 tablets on top of the food's. Fails with the old `moh.json`.

## 2026-10-23: vitamins and minerals as rows with daily values

**Done:**
- The owner couldn't tell what the day's vitamin line was, and wanted it like the macros, with targets. "ויטמינים ומינרלים שצרכת היום" (still folded) now says what it counts and lists a row each: amount / label Daily Value, a bar, "✓ הושג" once reached; sodium is a limit ("עד 2300", "מעל היעד"). Reports has the same rows (a day's or the average) in their own card. One `GoalRow` in `ui.tsx` draws the macro rows and these; `microAmounts` in `lib.ts` lists the nutrients, `DAILY_VALUES` in `goals.ts` the targets (FDA label values, same basis as the default goals).
- Screen test: the multivitamin's rows against their values, ✓ where reached, sodium over its limit.

**Next:** done in the entry above.

## 2026-10-23: the add window: foods and saved meals in one list

**Done:**
- The owner wanted one list, not "הרגילים שלך" and "ארוחות שמורות" apart. Now one list, most logged this past month first (at any meal), then most recent. 10 shown (was 5), up to 30 foods plus every saved meal behind "עוד".
- A saved meal now counts the meals that had all its foods (it used to average its foods' counts, so a meal with tea in it ranked as high as tea). It's marked with the utensils icon (and "ארוחה שמורה" for screen readers); the hint line explains the icon.
- Screen test: six typed foods + the saved meal, one list, 10 shown, the rest behind "עוד", no separate saved-meals group. Fails with the old two lists.

## 2026-10-23: quicker logging: no meal buttons, a label button, foods page tucked away

**Done:**
- The owner doesn't care about breakfast/lunch/dinner and wants logging quick. The ＋ window has no meal buttons now: everything goes to the meal of the time of day; buttons say "הוסף" / "סיום · נוספו N · K קק״ל". The diary still groups by meal, and the entry editor keeps its meal buttons for moving one.
- "תווית": a 4th big button beside צילום / מהגלריה / כתיבה (`FileButton` in `ui.tsx`, shared with `PhotoPick`; `.choices` lays out any number in a row). It opens the camera, reads the label, and `LabelCheck` shows the name and values; "המשך" saves the food and opens the amount, "עריכה" opens `FoodForm` filled in (`labelFood` in `Foods.tsx`, shared with the form's own label reading). The old "מוצר ארוז או תוסף?" link is gone.
- The מזונות tab is out of the bottom bar; Settings → "המזונות והארוחות שלי" opens the same page (editing and hiding foods, saved meals). Screen test reworked: it picks meals with the clock (`at()`), and opens the foods page through Settings.

## 2026-10-23: doubled foods, misread labels, single-food "meals"

**Done:**
- The owner's "קוטג' קטן" was saved at 350 kcal per 100 g: the label scan put sodium (350) in calories (95), saturated fat (3.25) in carbs (1.5) and cholesterol (15) in calcium (100). Saving a food now asks first ("לשמור בכל זאת?") when its calories don't fit its macros (4/4/9, off by more than 25% and 20 kcal: `kcalOff` in `search.ts`), or when it's likely one you have: the same name, or one of your own with the same numbers per gram (`sameFood`; yogurt 20% and 25% differ). One helper, `saveFood` in `Foods.tsx`, for the form and the add window's label check.
- The label photo a food was read from is kept at `<user>/labels/<food id>.jpg` in the `meal-photos` bucket (its policy already covers the user's folder; no database change) and shows under "הטבלה שנסרקה" when editing the food. Backups carry it. Older scans weren't kept.
- Saved meals use each food's current values (`mealItems` in `lib.ts`), so fixing a food fixes every meal that has it. "בוקר מליו" shows the 350 until the cottage cheese is fixed (rescan it, or עריכה: 95 kcal, 1.5 g carbs, 350 mg sodium, 100 mg calcium).
- A saved meal needs two foods or more: "שמור כארוחה" shows only then, and the meal editor says why. The existing one-food meal "הפוך" is the owner's to delete.
- Tests: `search.test.ts` (the cottage cheese, the yogurts); screen test (the warning, cancel and save anyway, a duplicate, a two-food meal that follows its food's fix, the label photo).

## 2026-10-23: the photo guesses hidden oil and sauce

**Done:**
- Research (NIH-linked study, July 2026) found photo calorie apps miss 250–345 kcal a meal, mostly fat they can't see. `meal-photo` (v8) now adds the frying oil, dressing, butter or sauce as its own item in spoons with `hidden: true`, under a plain name the database matches ("שמן זית", "חמאה", "טחינה"); not for foods it names as fried, whose oil the database already counts.
- The review list marks such a row "ניחוש: שמן או רוטב שלא רואים בתמונה…" so the owner fixes the amount or removes it. It's included by default, since leaving fat out is the known error. Test mode's photo answer has a guessed olive oil; the screen test sees the note and removes it.

**Next:** the owner chose "numbers I don't trust" as the main pain. Other ideas from the same research, not built: weekly adaptive calorie target from weigh-ins (no AI cost; asks before changing goals), "what can I still eat" from usual foods.

## 2026-10-23: a meal's photo moves with its last food

**Done:**
- Moving a meal's last food to another meal (tap the entry, change the meal) left the photo on the empty meal. `Day.tsx` now moves it along (`movePhoto` in `lib.ts`: Storage `move`, renaming `<meal>.<id>.jpg`; the existing `own_meal_photos` policy is `for all`, so no database change). One helper, `photosLeft`, decides for both delete and move.
- Screen test: move the foods one by one, the photo stays until the last, then is at dinner, still after a reload. Fails without the fix.

## 2026-10-23: the add window's usual foods: one list at every meal

**Done:**
- The owner wants the meal picked from the time of day, but the list itself fixed: "הרגילים שלך" (was "…בצהריים") now ranks foods and saved meals by how often they were logged this past month at any meal, then by recency. Switching the meal no longer reorders it. Top 12 by that count (was: 12 most recent, re-sorted).
- Screen test: a cucumber logged once at breakfast; the list is identical at lunch, breakfast, dinner and snacks, grapes (logged most) first. Fails with the old per-meal count.

## 2026-10-23: the app's own confirm and prompt windows

**Done:**
- The browser's `confirm()`/`prompt()` boxes (site address, "Cancel/OK") are gone: `confirmIt`/`promptIt` + `AskHost` in `ui.tsx` show a small app-styled `Modal` instead. Used for deleting a photo, naming a saved meal, hiding a food, deleting a saved meal, restoring a backup.
- Screen tests tap the app's buttons (cancel keeps the photo) and fail if any browser dialog opens.

## 2026-10-23: deleting a meal's last food takes its photo

**Done:**
- The owner deleted the only food in dinner and the meal photo stayed, over "עוד לא נרשם כלום". Photos aren't linked to entries (no table), so `Day.tsx` now hides the meal's photos when its last food is deleted, says so in the undo toast ("נמחק עם תמונת הארוחה", now `role="status"`), and deletes them for good once the 6-second undo passes. Undo brings both back.
- Screen test for it (fails without the fix). CLAUDE.md: every reported bug gets a test that reproduces it.


## 2026-10-23: a photo's potato: boiled is boiled, "מעוך" is פירה

**Done:**
- The owner photographed one boiled potato. The photo AI listed it twice ("מבושל" and "מעוך"), "מבושל" matched *fried* potatoes (185 kcal/100 g instead of 86), and "מעוך" matched nothing.
- `search.ts`: "מטוגנים" and words like "ושמן" now count as processed, so plain boiled ranks first; `SAME` maps מעוך → פירה; `matchFoods` drops unknown words from the end instead of leaving a row unmatched (`splitAnd` still checks the exact phrase). Test in `search.test.ts`.
- `meal-photo` prompt: each food once (a cut or squashed potato is one item), mashed potato is "פירה". Function redeployed.

## 2026-10-23: "שכחתי משהו?" offers foods as you type

**Done:**
- In the photo/typed review list, typing in "שכחתי משהו?" now lists up to 5 matching foods under the field (for the last item typed); tapping one adds it with the amount typed ("2 עגבני" → 2 tomatoes). "הוסף" still adds a whole typed line. `FoodHits` in `Review.tsx` is shared with the row's "חיפוש מזון אחר…". The owner typed "עגבני" and had no list to choose from.

## 2026-10-23: photo amounts no longer blown up

**Done:**
- The owner's photos came back as 4 lettuces (2.6 kg) and 6 medium potatoes for two leaves and a few small potatoes. The cause was mostly the app: the model said "4 יחידה" meaning leaves, and `unitFor` turned a bare "יחידה" into the food's medium whole unit (a 648 g head).
- `meal-photo` (v7) now also returns `grams`, its weight guess per item, and the prompt says a יחידה is a whole item, count only what's visible, judge size against the plate, guess smaller when unsure.
- `unitFor` checks the unit against `grams`: more than 1.6× off, it takes the food's unit that fits the same count (4 × "עלה" of 11 g), else the grams themselves. Typed text has no `grams`, so it's unchanged. Tested in `search.test.ts` with the owner's lettuce, potatoes and schnitzel.

**Next:** if photos still misjudge sizes, a stronger model (`MEAL_PHOTO_MODEL`) is the next lever; it costs more per photo, so ask first.

## 2026-10-23: vitamins out of the way while adding

**Done:**
- The owner found the vitamin line while adding food confusing and incomplete. `NutLine` (amount picker, review list, meal editor) now shows calories and macros only. Vitamins show in a food's details in the מזונות tab (`MicroLine` under `FoodSummary`) and in the day summary folded as "ויטמינים ומינרלים היום" (`MicroLine` with `label` is now a `<details>` with a note that MoH foods carry only sodium, calcium, potassium and B12). Reports unchanged.

**Next:** the MoH database has more vitamins than the four the app loads; adding them would complete the picture for food.

## 2026-10-23: supplements and all their vitamins

**Done:**
- `foods.extra` / `entries.extra` (jsonb, migration `extra_vitamins`): other vitamins and minerals by "name (unit)", names from `VITAMINS` in `lib.ts`. `scale`, `sum` and `pickItem` carry them, so amounts, day totals, report averages (now `scale(sum, 1/days)`) and CSV columns include them; `MicroLine` lists them after the four columns.
- Label reading (`meal-photo` v6, deployed): the app sends `names: VITAMINS`; supplement labels with only a per-tablet column and no weight come back per piece (`basisG: 1`, unit טבליה/כמוסה = 1 g) with `extra`. IU converted in the prompt.
- ＋ window: "מוצר ארוז או תוסף? צילום התווית" opens the new-food form, then the amount. The form shows `extra` fields and a "ויטמין או מינרל נוסף" picker. The day summary has a "ויטמינים ומינרלים" line (`MicroLine` with `label`).
- Test mode's label answer is now a multivitamin; the screen test reads it, adds magnesium by hand, logs 2 tablets and checks the day line.

**Next:** no daily targets for the new vitamins yet (only B12 has one). Not tried on a real supplement label yet.

## 2026-10-23: water tracking

**Done:**
- `WaterLine` (in `ui.tsx`) under the macro rows: "מים 0.75 / 2 ליטר" with "פחות כוס מים" / "עוד כוס מים". A glass is a normal entry (`WATER` in `lib.ts`: moh-9593, 250 g, 0 kcal) at the current meal; `isWater` (the plain MoH waters) keeps them off the meal lists and out of "שמור כארוחה". "פחות" deletes the latest glass with the usual undo. Goal fixed at 2 L (`WATER_GOAL_ML`); no database change.

## 2026-10-23: photos in the backup

**Done:**
- "הורדת גיבוי" adds `Photo: [{ path: "<date>/<meal>.<id>.jpg", jpeg: base64 }]` (`exportPhotos` in `lib.ts`); "שחזור מגיבוי" uploads them back with upsert (`restorePhotos`) and keeps photos already there. Older backups without `Photo` restore as before. Test mode keeps photos in localStorage now, so a restore's reload keeps them; the screen test downloads a backup, deletes the photo, restores, and sees it back.

## 2026-10-23: meal photos kept in the diary

**Done:**
- A photo whose foods are added is saved with the meal (`savePhoto` in `lib.ts`, after "הוסף ל…" in the review list) and shown in the diary as a square above that meal's foods; tap opens it with "מחק תמונה". Storage bucket `meal-photos` (private, JPEG, 2 MB max), path `<user>/<date>/<meal>.<id>.jpg`, so no table; migration `meal_photos_bucket`. CSP `img-src` now allows the Supabase origin for the signed URLs. Test mode keeps photos in memory.

**Next / limits:** offline, a photo isn't saved (the error banner says so) and the diary shows none. Moving a meal's entries to another meal leaves the photo where it was.

## 2026-10-23: usual foods at another amount

**Done:**
- In the add window's "הרגילים שלך", each food row is now two buttons: ＋ adds at last time's amount (tap again takes it back), and the name opens the amount picker filled with last time's amount (`Pick` with `onOpen` in `AddDialog.tsx`). Saved meals stay one tap. A row shows what this visit added, so after adding 2 tomatoes it says 2. (The owner wanted 2 tomatoes where the list offered 1.)

## 2026-10-22: a note with every photo

**Done:**
- A picked or taken meal photo isn't read straight away: it shows with "הערה (לא חובה)" and "זהה מזונות" / "תמונה אחרת" (`PhotoNote` in `AddDialog.tsx`). The note goes to the model, which already trusts it over the photo. `usePhotoUrl` in `ui.tsx` is shared with the reading spinner.

## 2026-10-22: review list can search any food

**Done:**
- In the photo/typed review list, each food's picker has "חיפוש מזון אחר…": it turns the row into a search over the whole database (5 results), and picking one replaces the food with its amount re-suggested. Rows with no match get a "חיפוש" button too. (The owner's photo showed grated Bulgarian cheese as yellow cheese, and the picker only offered yellow cheeses.)

## 2026-10-22: foods tab rows show just the name

**Done:**
- Each food and saved meal is one line: its name (a `<details>`; tapping it shows the values or the meal's foods, with עריכה / הסתרה or מחיקה) and a ＋ that adds to the diary. Lists, search results included, show 5 at a time ("הצג עוד", then "הצג פחות"). `ItemRow` and `Fold` in `Foods.tsx`.

## 2026-10-22: foods tab buttons

**Done:**
- "מזון חדש" and "ארוחה חדשה" are primary (blue) buttons, as on the other screens; they were white and hard to see.

## 2026-10-22: foods tab in order

**Done:**
- The foods tab starts with the search box, so typing shows results right under it; while searching only the results show (with "מזון חדש"). Without a search: "המזונות שלי (N)" (foods the user added or edited, `source !== 'moh'`) and "ארוחות שמורות (N)", each showing 5 with "הצג הכל". The MoH database is only reached by search.
- Then: one tap on a saved meal in the foods tab adds it to the diary's day at the meal of the time of day, with a 6-second "בטל" toast; a food tap opens the amount picker as before.

## 2026-10-22: Settings, one clear place to start

**Done:**
- Settings opens with "היעדים שלך": the current goals in one line, whether they're general or tailored, the primary "התאמה אישית" button and a small "עריכה ידנית" link. Manual editing warns when carbs+fat+protein don't add up to the calories (within 10%).
- Tailoring is a 4-step window (`Tailor.tsx`): body (incl. weight, prefilled from the last weigh-in), activity and aim, carb plan (radios), summary with the arithmetic → "השתמש ביעדים האלה". A changed weight is saved as today's weigh-in.
- The weigh-in moved to Reports, above the weight chart; it never changes goals. Shared `saveWeight` in `lib.ts`.

## 2026-10-22: clearer ＋ list, gum is a יחידה

**Done:**
- The ＋ screen's list has titles: "הרגילים שלך ב<meal>" (5 foods, "עוד N" for the rest, with "לחיצה מוסיפה בכמות של הפעם הקודמת") and "ארוחות שמורות" as its own group, instead of one mixed list with an unexplained star.
- Label scanning names the serving "יחידה" when the label says it is one piece (a gum, a bar), otherwise still "מנה" (`servingIsPiece`). `meal-photo` redeployed (version 5).

## 2026-10-22: fat back on the diary

**Done:**
- At the owner's request fat is back as the diary's third row, "X / 78 ג׳", for reference only (no green/amber: too little fat is as bad as too much). `DAY_GOALS` has `kind: 'min' | 'max' | 'ref'`.

## 2026-10-22: general defaults, tailoring on request

**Done:**
- Defaults for everyone are the nutrition-label Daily Values (2000 kcal, protein 50, carbs 275, fat 78; `DEFAULT_GOALS`, and `goalsOf` fills any empty goal with them). Without body details the diary says "יעדים כלליים, לא מותאמים לגוף שלך" with a link to tailor.
- Settings: "שקילה" only logs weight (never changes goals). "התאמת היעדים" takes sex, age, height, activity, aim and a carb plan (standard / 130 / 100 / 50, stored in `body.carbsMax`), uses the latest weigh-in, names what's missing, shows each suggested goal with its arithmetic in the user's numbers, and applies them only on "השתמש ביעדים האלה".
- Replaces the weigh-in prompt from earlier today.

## 2026-10-22: no made-up protein goal

**Done:**
- Protein needs body weight, so it's never guessed: new profiles start without a protein goal (and carbs 130), and while there is none the diary's protein row shows "הזינו משקל כדי לקבוע יעד חלבון", which opens Settings with the weigh-in unfolded (`open={!p?.protein}`). The screen test starts from that state and checks the goal appears after the weigh-in.

## 2026-10-22: smaller add button, carbs goal 130

**Done:**
- The ＋ button sizes to its label (48px tall, lighter shadow) instead of filling the row, so the ring is the one focal point.
- At the owner's request, set their stored carbs goal to 130 (`profiles.carbs`). Their protein goal is empty (null), so the diary shows no protein target until a weigh-in or a value in Settings.

## 2026-10-22: "איך נקבעו היעדים?"

**Done:**
- Under the diary's two goals, a disclosure explains them: protein by body weight (1.8 g/kg, counted up to a BMI-25 weight, with the owner's own numbers after a weigh-in), carbs as a soft limit, why fat has no goal, and two guidance tables with sources (`GoalsInfo` in `ui.tsx`). The formula's numbers come from `goals.ts` (`PROTEIN_PER_KG`, `CARBS_MAX`, `proteinKg`), so the text can't drift from the math.

## 2026-10-22: diary shows protein and carbs only

**Done:**
- At the owner's request the diary summary shows two goals: protein first, a minimum ("לפחות", green ✓ once reached), and carbs, a soft limit ("עד", green under it, amber "מעל היעד" over). Fat and micros left the diary; Reports still shows them (`DayGoals` in `ui.tsx`).
- `suggestGoals` is low-carb now: carbs at most 130 g, fat takes the rest of the calories. The owner's stored carbs goal (250) still needs changing to 130 in Settings or by a weigh-in.

## 2026-10-22: summary card, more air

**Done:**
- The calorie ring is bigger (140px, thinner line, 32px number) and the ＋ button shorter (56px), so the two are better balanced and "2000" no longer touches the ring. More space between the macro rows, under "נצרכו", and above the micros (`styles.css`).

## 2026-10-21: Settings order

**Done:**
- At the owner's request "יעדים יומיים" is first (its save is the primary button); the weigh-in and calculator moved under "חישוב לפי משקל", folded in a "שקילה ועדכון היעדים" disclosure, closed by default. The hint text is shorter. The screen test opens the disclosure before weighing in.

## 2026-10-21: diary top, less crammed

**Done:**
- At the owner's request the "הוספה" button moved from floating over the list to the top of the summary card, beside the ring (`.summary-top`). The calories line, nutrient bars and micros now run full width under them, so nothing is squeezed next to the ring. The floating `.fab` and its extra bottom padding are gone.
- Noticed on the owner's screenshot: the protein goal is empty in their profile (the protein row shows no "/ goal"). A weigh-in or "שמור יעדים" in Settings fills it.

## 2026-10-21: new app icon

**Done:**
- The owner picked a curvy hourglass figure: two white curves (shoulders, waist, hips) on indigo, with golden sand gathering at the bottom. `public/icon.svg` is the source; `icons/icon-192/512.png` (rounded), `icon-maskable-512.png` (full bleed, art inside the safe zone) were rendered from it.
- The 4 long-press shortcut icons are now the app's own line icons (sunrise, sun, moon, star) in white on indigo, instead of the old emoji-style pictures.
- On the phone: Android refreshes the home-screen icon by itself within about a day, or at once after removing the app and adding it again; iPhone needs remove and add.

## 2026-10-21: waist measurement

**Done:**
- The owner builds muscle while losing fat, so the scale alone can stand still. Weigh-ins now take an optional waist (cm) next to the weight (migration `weights_waist`, approved).
- Reports: one `TrendChart` draws both the weight and the waist over the range, each with the change in words.
- The screen test enters a waist on both weigh-ins and finds the waist chart by name; dropping the waist on save made it fail.

**Next:** body fat % only if the owner gets a scale that shows it (asked, no answer yet).

## 2026-10-21: weight log

**Done:**
- Database (migration `weight_log`, approved by the owner): a `weights` table (date, kg; RLS like the others) and `profiles.body` (sex, birth year, height, activity, aim). `Weight` is one more model in `db.ts` (offline queue, backup and restore included) and in test mode.
- Settings: "משקל ויעדים" card. Type today's weight and tap "שמור משקל ועדכן יעדים": the weigh-in is saved (one per day; a second one that day replaces it), the body details are saved to the profile, and the 4 goals are recalculated and saved from the new weight. The details sit in a "פרטים לחישוב" disclosure, open until filled once. The calculator's old on-phone copy (localStorage `body`) seeds the form once. Manual "שמור יעדים" still works.
- Reports: a weight line chart for the chosen range (2+ weigh-ins), with the change in words ("ירידה של 1.8 ק״ג"); a signed number flipped in RTL.
- The screen test weighs in a week ago and today, checks the goals follow, and finds the chart by its accessible name; breaking the goal update or the saved details made it fail.

**Next:** watch that the owner weighs in weekly; if the trend stalls 3–4 weeks, the aim or activity may need changing.

## 2026-10-21: camera button, quieter foods tab, goals calculator

**Done:**
- Photos: "צילום" (opens the camera, `capture="environment"`) and "מהגלריה" are separate buttons again. Android's photo picker no longer offers the camera for a plain file input, so the single button only opened the gallery. `PhotoPick` renders both, plus an optional third choice (the add window's "כתיבה").
- Foods tab: saved meals show the name and how many foods, not the full list; the food list appears only while searching.
- Settings: "חישוב לפי גובה ומשקל" (a `<details>`) works out the 4 goals from sex, age, height, weight, activity and aim (`src/goals.ts`, tested in `goals.test.ts`): Mifflin-St Jeor × activity, −20% for losing weight while building muscle, never below resting needs; protein 1.8 g/kg up to a BMI-25 weight, fat 30%, carbs the rest. It only fills the fields; "שמור יעדים" saves. The body measurements stay in localStorage on the phone (no database change).

**Next:** if the owner wants the measurements on every device or a weight log, that needs new columns: ask first.

## 2026-10-21: redesign step 4, the other tabs

**Done:**
- Foods, reports and settings each open with a page heading (`<h1>`), and their cards sit under small grey group titles, like the diary's meals. One `Group` component in `ui.tsx` (heading + optional action button + card) does this everywhere, the diary included.
- Foods: "ארוחה חדשה" and "מזון חדש" moved next to their group titles; the search box has its own name ("חיפוש במאגר").
- Reports: the CSV and PDF buttons are equal, side by side, with room around them.
- Paragraphs inside forms have no extra margins (`.form p`); the form's gap spaces them, so cards no longer start with an empty strip.

**Next:** nothing planned for the redesign; watch for anything that looks off on the phone.

## 2026-10-21: redesign step 3, the add window

**Done:**
- The list screen has two big buttons: "צילום או תמונה" (one file input without `capture`, so the phone offers camera or gallery; it was two buttons) and "כתיבה" (was a small link).
- While a photo is read (meal or nutrition label), `PhotoPick` shows that photo dimmed under a spinner with "מזהה מזונות בתמונה… / זה לוקח כמה שניות" (`role="status"`), and the typing form is a disabled `<fieldset>`. The photo is shown from a `blob:` URL, so the CSP has `img-src 'self' blob:`.
- Disabled buttons say why, in readable text linked with `aria-describedby` (`Why` in `ui.tsx`): "כתבו מה אכלתם כדי להמשיך", "אפשר להמשיך כשהזיהוי יסתיים", "כתבו כמות גדולה מאפס כדי להוסיף", "אין עדיין מזון עם כמות להוספה".
- `.form label` styles field labels only (`:not(.btn)`), so a `<label class="btn">` file button looks like a button inside forms.
- The screen test checks the loader and the reason on the locked button; giving the wrong reason on purpose made it fail.

**Next:** step 4, the other tabs (foods, reports, settings) in the same style.

## 2026-10-21: redesign step 2, the diary

**Done:**
- Date header without a card, a bigger "היום".
- Summary card: a progress ring (`Ring` in `ui.tsx`: calories toward the goal, red when over) beside the macro bars, "נצרכו X מתוך Y קק״ל". The separate calorie bar is gone (the ring shows it).
- Meals are one card under a "ארוחות" heading, a named section per meal, entries indented under the meal name with the amount in grey, and "עוד לא נרשם כלום" for an empty open meal.
- "＋ הוספה" floats at the bottom center above the tabs (`.fab`); the undo toast sits above it.
- Reports: the macro donut is the same 96px size; the meal icon in the daily breakdown has space before its name.

**Next:** step 3, the add window (photo loader over the dimmed photo, a readable "why it's disabled" line, bigger photo/type buttons), then the foods, reports and settings tabs.

## 2026-10-21: redesign step 1, the foundation (colors, font, icons)

**Done:**
- New design tokens in `styles.css` `:root`: warm neutrals, one indigo accent, macro colors sand/terracotta/slate (`--carbs`, `--fat`, `--protein`), red only for "over". Dark mode follows the phone (`prefers-color-scheme`) and redefines the same tokens. No hard-coded colors left outside the tokens (print aside).
- Rubik, self-hosted via `@fontsource-variable/rubik` (works offline). Google Fonts are gone, so the CSP is `style-src 'self'; font-src 'self'`.
- `src/icons.tsx`: one set of line icons replacing every emoji and symbol (meals, tabs, ✕, ✎, 🗑, ☆, ⇩, ＋, 📷, 🖼️, 💊). `MEALS` carries an icon name and a `short` label for the meal tabs.
- Readable minimum 14px text, 44px touch targets (`--tap`) on buttons, icon buttons, inputs and meal tabs; disabled buttons are clearly grey instead of faded. Icon-only buttons in the foods tab now have names ("עריכה: …", "מחיקה: …").

**Next:** step 2, the diary layout from the mockup (one summary card, meals as a list, floating ＋), then the add window (photo loader, "why it's disabled" line), then the other tabs.

## 2026-10-21: screen test covers the main flows, before the redesign

**Done:**
- `e2e/screens.mjs` finds everything by role and name (no CSS classes), so the redesign can't break it by renaming styles. It now covers 11 flows: one ＋, search and add, meal switch, photo review, "שכחתי משהו?", diary totals, edit amount and meal, delete and undo, save a meal and re-add it, day navigation, back button, foods tab. Breaking undo on purpose made it fail.
- Diary meal sections are named regions (`aria-label`), and delete buttons say what they delete ("מחק: ענבים…").
- Fixed a test-mode bug the test found: saving a meal showed it twice, because the demo layer's `list` returned its own array. It returns a copy now, like the real layer.
- CLAUDE.md "How we build": the owner's standards (W3C/WCAG, DRY, CSS tokens and the cascade, behavior-based tests).

**Next:** the redesign (mockup approved: Rubik, warm neutrals, one indigo accent, line icons, follows the phone's light/dark), in small steps that each pass all tests.

## 2026-10-21: a saved screen test

**Done:**
- `npm run test:screens` (`e2e/screens.mjs`, `playwright-core` + Node's test runner) clicks through the main flow in test mode at phone size: one ＋ opens on lunch at 13:00, search ענבים and add, switch to dinner, a photo opens the review list, "שכחתי משהו?" adds a regular pita, add all, and the diary has the entries under the right meals with a total. Breaking "שכחתי משהו?" on purpose made it fail, so it does catch things.
- Shipping now requires it to pass (CLAUDE.md). Vercel can't run it (no browser), so it runs in the session before merging.

**Not covered yet:** saving to Supabase and offline sync, the photo Edge Function, reports and CSV, settings and backup.

## 2026-10-21: "פיתה" finds a regular pita

**Done** (branch `claude/pita-search`):
- "פיתה" (and "פיתות") now finds the regular pita (`moh-1946`, 227 kcal) instead of toasted pita. `STAPLES` in `search.ts` maps an everyday word to its plain entry, for staples whose plain entry loses only on name length. Across all 1,667 one- and two-word names, only "פיתה" changed. Add other staples there the same way when one shows up.

## 2026-10-21: meal tabs back in the add window; add what the photo missed

**Done** (branch `claude/review-add-and-meal`, draft PR, not live yet):
- The owner couldn't change the meal: the menu in the add window's title didn't work for them. It is replaced by the four meal tabs at the top of the window (`MealSeg`, shared with the entry editor), with the time of day's meal already pressed. They stay visible on every step, and the review list's button names the meal ("הוסף לארוחת צהריים"). The title menu, its CSS and the ✕-first header order are removed.
- The photo/typed review list has "שכחתי משהו?" at the bottom: typed like a meal line ("פיתה, 2 כפות טחינה"), parsed and matched like the rest, added as more rows.

## 2026-10-21: one ＋ button, meal photo up front, most-used foods first

**Done** (branch `claude/meal-photo-button`, PR #9, not live yet):
- One "＋ הוספה" button under the day's summary replaces the four ＋ buttons on the meals. The meal comes from the time of day (`mealNow`: breakfast until 11, lunch until 16, dinner until 21, then snacks). The window's title is a menu ("הוספה ל[ארוחת צהריים ▾]") to change it. The owner said the meal doesn't matter to them, so they shouldn't have to pick it.
- Search and the ＋ list put the foods logged most often in the past 3 months first, ties by most recent (`App.tsx` counts them once at start from the cached diary; logging adds to the count). It used to be the last 40 by recency only. Favorites were considered and left out: more buttons, and frequency does the same by itself.
- Modals put ✕ first in the DOM (shown at the end by `row-reverse`), so opening one focuses ✕ and not the meal menu in the title, which Chrome always outlines.
- The ＋ screen shows "📷 צלם ארוחה" and "🖼️ בחר מהגלריה" right under the search box. A photo goes straight to recognition and the review list, with no typing screen first. Before, the photo was only behind the small "או כתבו מה אכלתם, או צלמו" link under the list, and the owner looked for it in the new-food form instead.
- The link is now "או כתבו מה אכלתם", for typing. A photo with a note still works from there.

## 2026-10-21: carrot search, and where the meal photo is

**Done** (branch `claude/search-carrot`, draft PR, not live yet):
- "גזר" finds fresh carrot first, not "גזר לבן" (parsnip). The same small tie-breaker moves 5 other plain-vegetable searches to the generic fresh version (דלעת, נבטים, כרישה, פלפל, פלפלים). Checked against all 1,667 one- and two-word names in the database: nothing else changed.
- Typed lines and meal photos: a name that exists only as an ingredient of dishes ("גזר כבוש": the database has no pickled carrot, only potato salad with carrot and pickles) now suggests the plain food ("גזר, טרי") first. The dishes stay lower in the list.

## 2026-10-20: units you can add without knowing a piece's weight

**Done** (branch `claude/fervent-heisenberg-zpz8pi`, draft PR, not live yet):
- A new unit is typed as "how many weigh how many grams": "20 מסטיק = 28 ג׳" saves one מסטיק as 1.4 g. Same row in the food's ✎ form and in the amount picker's "＋ יחידה חדשה…", with a one-line explanation above it.
- The label photo now always names the package's serving "מנה". It used to call it "יחידה", so peanut chocolate lentils got "יחידה" = 300 g (the whole bag), and the name for a single lentil was taken.

**Next:**
1. **Redeploy the `meal-photo` function** after merging (`supabase functions deploy meal-photo`), or the label fix doesn't take effect.
2. **Fix the existing food:** עדשי שוקולד עם בוטנים has "יחידה" = 300 g. In ✎, rename it "שקית" and add e.g. "<count in bag> עדשה = 300 ג׳".

## 2026-10-19: change amounts in saved meals, fold diary meals

**Done** (branch `claude/port-meal-editing`, draft PR, not live yet), ported from the upstream repo:
- Saved-meal editor: tap a food to change its amount ("עדכן כמות") instead of removing and re-adding it.
- Diary: tap a meal's header to fold or unfold it. Today, meals before the current one start folded; adding to a meal unfolds it.

## 2026-10-19: the ＋ screen and the phone's back button

**Done** (commit 954bf3d, live):
- The ＋ on a diary meal opens one list of what you usually eat *at that meal*: saved meals and foods, ordered by how often you had them there in the past month, each at last time's amount. One tap adds, a second tap takes it back out, "סיום" closes. No meal buttons and no "חזרה" links on that screen.
- The "⎘ העתק מאתמול" button is gone; the list replaces it.
- The phone's back button goes back instead of leaving the app: it closes an open window (inside the ＋ screen, it goes back one step first), and from the other tabs it returns to the diary.
- Only the diary flow changed. The מזונות tab's own add-food window looks as it did before, on purpose.
- The GitHub repo is now public. No keys or passwords are in it.

**Next:**
1. **Try the back button on your Android phone.** It was tested only with Esc on a computer, which uses the same browser mechanism. It needs Chrome 120 or newer.
2. **Coffee search picks dry powder.** Typing "2 כפות קפה שחור" in the typing box matches instant coffee powder (about 106 kcal), and "ספל קפה שחור" about 880 kcal. It should match a cup of prepared coffee (`moh-4803`, a few kcal). Still true after today's search fixes. Until it's fixed, add coffee from the ＋ list or search "טורקי".
3. **Changing an amount:** a usual item goes in at last time's amount. To change it, tap the item in the diary.
4. Small things noticed, not asked for: the design checker flags the calorie bars for animating their width (`styles.css`). The day summary's micronutrient line (נתרן, סידן…) is busy for a daily view.

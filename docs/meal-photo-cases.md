# Meal recognition: cases to grade against the real model

Run these through the live app (or a session with the `ANTHROPIC_API_KEY`) after any change to the `meal-photo` prompts, and before. Test mode can't: it answers with fixed samples.

What a case checks: the foods the review list ends up with, the question asked (if any), and the total calories in a range. Calories come from the database, so a wrong total means a wrong food or amount, not a wrong number.

Pass: every row's foods and questions as listed, and the total inside its range. Record the date, model and results in a short table under the case list.

## Cases

| # | Input | Expected foods | Question | Total kcal |
|---|---|---|---|---|
| 1 | Typed: "2 כפות עוגת קצפת קנויה" | one cake row (bought: not broken into ingredients) | none | 60–150 |
| 2 | Typed: "5 עגבניות שרי" | cherry tomatoes, 5 יחידה | none | 10–25 |
| 3 | Photo: 10 cherry tomatoes on a plate, no note | cherry tomatoes, about 10 | none | 15–45 |
| 4 | Typed: "סלט ירקות 2 כוסות" | vegetable salad + a guessed oil marked "ניחוש" | how much oil (בלי / כפית / כף) | answer בלי: 30–80, no oil row; כף: 110–180 |
| 5 | Typed: "סלט פסטה שהכנתי: כוס פסטה, מלפפון, עגבנייה, כף שמן זית" | pasta, cucumber, tomato, olive oil, each its own row | none | 300–420 |
| 6 | Photo: falafel in a pita, no note | falafel in pita (or falafel + pita) | tahini amount, or which dish if unclear | 350–650 |
| 7 | Typed: "שווארמה בלאפה" | shawarma, laffa (+ tahini or a question about it) | maybe tahini | 600–1000 |
| 8 | Photo: rice, chicken and salad on one plate | rice, chicken, salad (+ a fat if it looks dressed or fried) | maybe | 450–800 |
| 9 | Case 1 again, within 5 minutes | the app asks "כבר רשמת … להוסיף שוב?" before adding | — | — |
| 10 | Typed: "קפה עם חלב וסוכר" | coffee, milk, sugar | which coffee (נס קפה / הפוך) | 40–120 |
| 11 | Typed: "שניצל עוף" | fried chicken breast schnitzel (moh-818 or a sibling), no extra oil row | none | 250–450 for one |
| 12 | Typed: "סלט עוף" | after the answer: the deli salad (chicken + mayo) or the green salad (greens + chicken + oil) | which salad | depends on the answer |
| 13 | Typed: "סלט טונה" | a tuna salad entry from the database | none, or which kind | 150–350 per מנה |
| 14 | Typed: "סלט ביצים" | "סלט ביצים עם מיונז" (205 kcal/100 g) | none | 150–300 per מנה |

Past bugs, kept as cases so they don't come back:

| # | Input | Expected |
|---|---|---|
| 15 | Photo of a creamy soup with note "מרק תירס" (restaurant) | a creamy soup or its ingredients, not the instant packet |
| 16 | Typed: "3 כפות אורז מבושל" | cooked rice (~130 kcal/100 g), 3 כף, about 45–60 g |
| 17 | Photo of a salad with 4 lettuce leaves | lettuce in עלה, about 4 |
| 18 | Typed as dictated: "שתי כפות של עגבנייה ומלפפון" | tomato 2 כף, cucumber |
| 19 | Photo of star fruit slices on a plate, no note | carambola ("קרמבולה, טרי"), not bread and not "broken into ingredients" |

## Comparing models

`scripts/compare-models.ts` runs cases like these (photos with a known answer) through the function's code with each model and writes a report next to the cases file: pass/fail, foods, calories, time and cost per photo. How to run it is at the top of the script (Deno, `ANTHROPIC_API_KEY`). Photos stay out of the repo.

## Results

| Date | Model | Passed | Notes |
|---|---|---|---|

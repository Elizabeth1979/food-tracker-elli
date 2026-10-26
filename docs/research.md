# Research log

Every study or source the app relies on: what it found, and what we changed because of it. Newest first.
Add an entry when research changes the app or the guide (`src/articles/`). Say how sure we are: a conference abstract is not a peer-reviewed paper.

## 2026-10-24: what each vitamin and mineral does (the row's window)
- **Source:** the [NIH Office of Dietary Supplements fact sheets](https://ods.od.nih.gov/factsheets/list-all/) (health-professional versions), one per nutrient: function and main food sources. Iodine in Israel: low intake is common, partly because desalinated water has almost none (Israel's first national iodine survey, Ovadia et al., Thyroid 2017; link not checked this session). Biotin supplements can skew lab tests (FDA safety communication, 2017, updated 2019). Salt = sodium × 2.54 (molar masses, NaCl / Na).
- **Changed:** `MICRO_INFO` in `goals.ts`: a "why" line per nutrient, and the goal's reason where it isn't the plain label value (reasons as in the 2026-10-24 daily-values entry below). Written from those sheets without re-opening each one this session; recheck a line against its sheet before relying on a detail.

## 2026-10-24: recommendations are averages, not daily quotas
- **Source:** the DRIs define an RDA/AI as an average daily intake over time ([NIH ODS, e.g. vitamin D](https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/)). Fat-soluble vitamins (A, D, E, K) and B12 are stored; C and most B vitamins much less.
- **Changed:** no new view: Reports already shows a week's or month's average per logged day against the same values. The vitamins article now says so, and why a weekly supplement looks huge on its day and absent on the others.

## 2026-10-24: vitamins' daily values, and carbs (guide articles 6 and 7)
- **Daily Values:** the FDA's [2016 label rule](https://www.federalregister.gov/documents/2016/05/27/2016-11867/food-labeling-revision-of-the-nutrition-and-supplement-facts-labels) takes the highest RDA or AI among age and sex groups, so a DV often exceeds one person's need: iron 18 mg (women 19–50; 8 mg for men and women over 50), calcium 1300 mg (teens; adults 1000, women 51+ 1200).
- **Potassium:** the label DV is 4700 mg, but [NASEM 2019](https://ods.od.nih.gov/factsheets/Potassium-HealthProfessional/) lowered the adequate intake to 2600 mg (women) and 3400 mg (men). On 2026-10-24 the owner chose the women's 2600 for `DAILY_VALUES` (a single-user app; a man's would be 3400).
- **Sodium:** NASEM 2019 set 2300 mg as the level to reduce from (the app's limit); [WHO 2012](https://www.who.int/publications/i/item/9789241504836) says under 2000 mg (5 g salt). The article gives both.
- **Upper limits (adults, food + supplements):** vitamin A (retinol) 3000 mcg, vitamin D 100 mcg, iron 45 mg, zinc 40 mg. The app shows ✓ above a DV and never warns at an upper limit; the article says so. B6 and folic acid limits weren't confirmed this time, so they're left out.
- **Carbs:** NAM's RDA of 130 g (the brain's glucose use) and AMDR 45–65% ([DRIs 2005](https://nap.nationalacademies.org/catalog/10490)); low-carb under 130 g or 26%, ketogenic 20–50 g ([Feinman 2015](https://doi.org/10.1016/j.nut.2014.06.011)). So the app's "עד 130" plan is low-carb's upper bound. Keto plus SGLT2 inhibitors: euglycemic ketoacidosis case reports ([MJA 2020](https://www.mja.com.au/journal/2020/212/1/euglycaemic-ketoacidosis-sglt2-inhibitor-exacerbated-ketogenic-diet), [PMC7219989](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7219989/)), the reason the keto plan says "בליווי רופא". Fibre AI: 25 g women, 38 g men (to 50).

## 2026-10-23: the guide's sources (`src/articles/`)
The five in-app articles, checked against these. Cloud sessions can't open most of these sites directly, so the numbers were checked through search results quoting them; recheck against the full text when one matters.
- **Israeli nutrition labelling:** [תקנות הגנה על בריאות הציבור (מזון) (סימון תזונתי), התשע״ח־2017](https://www.nevo.co.il/law_html/law01/501_734.htm) (in force 2020; energy in kcal, sodium in mg, sugars also as teaspoons) and the [MoH red-label page](https://efsharibari.health.gov.il/governance/regulation/unhealthy-food-labeling-law/). Sources disagree on the red label's second-stage sodium limit (400 or 500 mg/100 g), so the article gives no thresholds. The "per 100 g is mandatory" rule wasn't confirmed from the text; the article only says the table has a 100 g column.
- **Protein:** [NAM DRIs](https://nap.nationalacademies.org/catalog/10490) (RDA 0.8 g/kg), [EFSA](https://www.efsa.europa.eu/en/press/news/120209) (0.83 g/kg), [PROT-AGE, Bauer 2013](https://doi.org/10.1016/j.jamda.2013.05.021) (over 65: 1.0–1.2 g/kg, 1.2–1.5 when ill), [Leidy 2015](https://pubmed.ncbi.nlm.nih.gov/25926512/) (weight loss: 1.2–1.6 g/kg, 25–30 g a meal), [ISSN 2017](https://doi.org/10.1186/s12970-017-0177-8) (training: 1.4–2.0), [Morton 2018](https://pubmed.ncbi.nlm.nih.gov/28698222/) (49 studies: gains level off near 1.6). The app's 1.8 g/kg sits inside ISSN's range. `GoalsInfo` (`ui.tsx`) still says 1.6–2.2 for strength training; 2.2 wasn't confirmed this time.
- **Portion estimation:** [Lucassen 2021](https://pubmed.ncbi.nlm.nih.gov/33761165/) (40 people, one weighed lunch: only 50% of text-aided and 35% of photo-aided estimates within 25%); [Timon 2018](https://doi.org/10.1007/s12603-017-0937-9) (older and younger adults vary widely, nutritionists less; amorphous foods overestimated, large pieces underestimated).
- **A spoon of oil:** Tzameret's כף שמן זית is 10 g (88 kcal); USDA's tablespoon is 13.5 g (119 kcal), a level 15 ml measuring spoon. The guide says both. No app change.

## 2026-10-23: calories must fit the macros (PR #57)
- **Source:** the energy conversion factors in [EU Regulation 1169/2011, Annex XIV](https://www.legislation.gov.uk/eur/2011/1169/annex/XIV): protein 4, carbohydrate 4, fat 9, alcohol 7, fibre 2, polyols 2.4, erythritol 0 kcal/g (the Atwater system).
- **Changed:** `kcalOff` in `search.ts` warns before saving a food whose calories are off 4/4/9 by more than 25% and 20 kcal. It caught the owner's cottage cheese scan (sodium 350 read as calories). Known false alarm: drinks with alcohol (beer: 43 kcal, 16 from its macros).

## 2026-10-23: vitamin and mineral targets (PR #58)
- **Source:** the US FDA's [Daily Values](https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels) for nutrition and supplement labels (adults, 2000 kcal).
- **Changed:** `DAILY_VALUES` in `goals.ts`: a row per nutrient against its label value; sodium as a limit (2300 mg).

## 2026-10-23: photo apps miss hidden fat (PR #54)
- **Source:** NIDDK/NIH, presented at NUTRITION 2026 (American Society for Nutrition, July 25–28 2026): 102 meals from a metabolic kitchen, every ingredient weighed, run through MyFitnessPal, Lose It!, Cal AI and Appediet. All four underestimated by about 250–345 kcal and ~30 g fat a meal (about a third); carbs were close; ketogenic meals were worse. A conference abstract, not yet a peer-reviewed paper. Coverage: [ScienceDaily](https://www.sciencedaily.com/releases/2026/07/260726015237.htm), [Newswise](https://www.newswise.com/articles/photo-based-calorie-tracking-apps-may-underestimate-energy-in-meals), [Medscape](https://www.medscape.com/viewarticle/photo-based-meal-apps-underestimate-calories-and-fat-2026a1000qo9).
- **Changed:** `meal-photo` (v8) adds the oil, dressing, butter or sauce it can't see as its own row in spoons, marked as a guess. It was included by default; since 2026-10-26 it's only offered (one tap adds it), at the owner's request: a typed "bread and cheese" got butter she never had. Not for foods named as fried (their oil is in the database). Also the guide article "למה תמונה מפספסת קלוריות".
- **Later, from the same research:** "מה נכנס ב־N קק״ל?" (PR #60). Not built yet: a weekly calorie target adapted from weigh-ins.

## 2026-10-22: goals from the body (PRs #20, #28, #31)
- **Sources:** default goals are the FDA nutrition-label Daily Values (2000 kcal, protein 50 g, carbs 275 g, fat 78 g). Resting energy: [Mifflin–St Jeor (1990)](https://pubmed.ncbi.nlm.nih.gov/2305711/). Protein: NAM RDA and the [ISSN 2017 position stand](https://doi.org/10.1186/s12970-017-0177-8). Carbs: the Dietary Guidelines for Americans (45–65% of calories).
- **Changed:** `goals.ts`: protein 1.8 g/kg counted up to a BMI-25 weight, no protein goal until a weigh-in, carbs a soft limit with low-carb plans (130/100/50 g), fat ≥ 20% of calories. `GoalsInfo` in `ui.tsx` explains them with these sources.

## Food data: the Ministry of Health's Tzameret database
- **Source:** משרד הבריאות, מאגר צמרת: 4,624 foods with calories, macros, vitamins and minerals, and piece, spoon and cup weights (`public/foods/moh.json`; the vitamins added from the data.gov.il API by `scripts/moh-vitamins.ts`, PR #59).
- **Changed:** all calories in the app come from it or from the user's own foods; a photo only names foods and guesses amounts.

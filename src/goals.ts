// Daily goals: general defaults for anyone, or worked out from body measurements. No data-layer imports, so tests can run it directly.
export type Body = { sex: 'f' | 'm'; age: number; heightCm: number; weightKg: number; activity: number; aim: number; carbsMax: number };
export type Goals = { kcal: number; carbs: number; fat: number; protein: number };

// The nutrition-label Daily Values, set for an average adult on 2000 kcal. Used until goals are tailored.
export const DEFAULT_GOALS: Goals = { kcal: 2000, protein: 50, carbs: 275, fat: 78 };
// A goal left empty falls back to its default.
export const goalsOf = (g?: Partial<Record<keyof Goals, number | null>> | null): Goals =>
  ({ kcal: g?.kcal || DEFAULT_GOALS.kcal, protein: g?.protein || DEFAULT_GOALS.protein, carbs: g?.carbs || DEFAULT_GOALS.carbs, fat: g?.fat || DEFAULT_GOALS.fat });

export const ACTIVITY: [string, number][] = [['בלי אימונים', 1.2], ['1–3 אימונים בשבוע', 1.375], ['4–5 אימונים בשבוע', 1.55], ['אימון כמעט כל יום', 1.725]];
export const AIMS: [string, number][] = [['לרדת במשקל ולבנות שריר', -0.2], ['לשמור על המשקל ולבנות שריר', 0], ['לעלות במסת שריר', 0.1]];
// 0: no cap, carbs are what's left after protein and 30% fat.
export const CARB_PLANS: [string, number][] = [['רגיל: מה שנשאר אחרי חלבון ושומן', 0], ['דל פחמימות: עד 130 ג׳', 130], ['דל פחמימות מתון: עד 100 ג׳', 100], ['קטו: עד 50 ג׳ (בליווי רופא)', 50]];

export const PROTEIN_PER_KG = 1.8;
// The weight protein is counted on: up to a BMI-25 weight, so extra body fat doesn't inflate it.
export const proteinKg = (weightKg: number, heightCm: number) => Math.min(weightKg, Math.round(250 * (heightCm / 100) ** 2) / 10);
// Mifflin-St Jeor resting energy.
export const restKcal = ({ sex, age, heightCm, weightKg }: Pick<Body, 'sex' | 'age' | 'heightCm' | 'weightKg'>) =>
  Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'm' ? 5 : -161));

export function suggestGoals(b: Body): Goals {
  const rest = restKcal(b);
  // Activity, then the aim's deficit or surplus; never below resting needs: too deep a deficit costs muscle.
  const kcal = Math.round(Math.max(rest * b.activity * (1 + b.aim), rest) / 10) * 10;
  const protein = Math.round(PROTEIN_PER_KG * proteinKg(b.weightKg, b.heightCm));
  // Carbs: what's left after protein and 30% fat, capped by the carb plan; fat takes the rest.
  const room = Math.max(0, Math.round((kcal * 0.7 - protein * 4) / 4));
  const carbs = b.carbsMax ? Math.min(b.carbsMax, room) : room;
  const fat = Math.round((kcal - protein * 4 - carbs * 4) / 9);
  return { kcal, carbs, fat, protein };
}

// What's left of each goal after what was eaten (negative once over).
export const goalsLeft = (g: Goals, eaten: Goals): Goals =>
  ({ kcal: g.kcal - eaten.kcal, carbs: g.carbs - eaten.carbs, fat: g.fat - eaten.fat, protein: g.protein - eaten.protein });

// "What can I still eat?": the usual things whose usual amount fits in the calories and carbs left (carbs are a limit,
// protein a minimum, fat what's left over). Protein still short → the most protein per calorie first; otherwise the
// most often eaten first (the order given). `keep` stays in its place whatever it costs: this visit's additions,
// so a tapped row doesn't vanish from under your finger.
export function whatFits<T extends Goals>(xs: T[], left: Goals, keep: (x: T) => boolean = () => false, max = 5): T[] {
  const fits = xs.filter((x) => keep(x) || (x.kcal > 0 && x.kcal <= left.kcal && x.carbs <= Math.max(0, left.carbs)));
  const ranked = left.protein > 0 ? [...fits].sort((a, b) => b.protein / b.kcal - a.protein / a.kcal) : fits;
  return ranked.slice(0, max);
}

// Vitamins and minerals: the nutrition-label Daily Values (FDA, adults), the same basis as DEFAULT_GOALS.
// Except potassium: the label's 4700 predates NASEM 2019, which set 2600 for women (3400 for men); the owner's is the women's.
// Keyed "name (unit)" like VITAMINS in lib.ts. Sodium is a limit; the rest are amounts to reach. Omega 3 has none.
export const SODIUM_MAX = 2300;
export const DAILY_VALUES: Record<string, number> = {
  'נתרן (מ״ג)': SODIUM_MAX, 'סידן (מ״ג)': 1300, 'אשלגן (מ״ג)': 2600, 'B12 (מק״ג)': 2.4,
  'ויטמין A (מק״ג)': 900, 'ויטמין D (מק״ג)': 20, 'ויטמין E (מ״ג)': 15, 'ויטמין K (מק״ג)': 120, 'ויטמין C (מ״ג)': 90,
  'ויטמין B1 (מ״ג)': 1.2, 'ויטמין B2 (מ״ג)': 1.3, 'ויטמין B3 (מ״ג)': 16, 'ויטמין B5 (מ״ג)': 5, 'ויטמין B6 (מ״ג)': 1.7,
  'ביוטין (מק״ג)': 30, 'חומצה פולית (מק״ג)': 400, 'ברזל (מ״ג)': 18, 'מגנזיום (מ״ג)': 420, 'אבץ (מ״ג)': 11,
  'סלניום (מק״ג)': 55, 'יוד (מק״ג)': 150, 'נחושת (מ״ג)': 0.9, 'מנגן (מ״ג)': 2.3, 'כרום (מק״ג)': 35, 'מוליבדן (מק״ג)': 45,
  'זרחן (מ״ג)': 1250, 'כולין (מ״ג)': 550,
};

// A period's daily average of a vitamin or mineral against its goal: "low" under 70% (most days likely miss a food
// that brings it), "ok" from there (normal day-to-day spread), "good" at the goal. One day alone is too noisy for this.
export const LOW_SHARE = 0.7;
export const microLevel = (v: number, goal: number) => (v >= goal ? 'good' : v >= LOW_SHARE * goal ? 'ok' : 'low');

// Grams of salt per gram of sodium (NaCl / Na, 58.44 / 22.99): labels and people think in salt, foods list sodium.
export const SALT_PER_SODIUM = 2.54;
// What each vitamin and mineral does, from the NIH Office of Dietary Supplements fact sheets, and, where its goal
// isn't the plain label value, why (the reasons are the vitamins article's, src/articles/6-vitamins.md).
export const DV_WHY = 'הערך היומי שעל תוויות המזון (FDA). לכל רכיב נבחרה ההמלצה הגבוהה מבין קבוצות הגיל והמין, אז לרוב האנשים הוא קצת מעל הצורך.';
export const MICRO_INFO: Record<string, { why: string; goal?: string }> = {
  'נתרן (מ״ג)': { why: 'שומר על מאזן הנוזלים ועל פעולת העצבים והשרירים. רובו מגיע ממלח, בעיקר בלחם, גבינות, מזון מעובד ומסעדות. עודף מעלה את לחץ הדם.', goal: 'הגבול של האקדמיה הלאומית לרפואה בארה״ב, מעליו כדאי להפחית. ארגון הבריאות העולמי מחמיר: פחות מ־2000 מ״ג, כ־5 ג׳ מלח.' },
  'סידן (מ״ג)': { why: 'בונה ושומר על העצמות והשיניים, ונחוץ גם לכיווץ שרירים, לפעולת העצבים ולקרישת הדם.', goal: 'הערך שבתוויות הוא הצורך של בני נוער. מבוגרים צריכים 1000 מ״ג, ונשים מגיל 51 צריכות 1200.' },
  'אשלגן (מ״ג)': { why: 'מאזן את הנתרן ועוזר לשמור על לחץ דם תקין. נחוץ לפעולת הלב, השרירים והעצבים. נמצא בעיקר בירקות, פירות, קטניות ומוצרי חלב.', goal: 'ההמלצה לנשים של האקדמיה הלאומית לרפואה בארה״ב מ־2019 (לגברים 3400). בתוויות עדיין כתוב 4700, המספר הישן.' },
  'B12 (מק״ג)': { why: 'נחוץ ליצירת תאי דם אדומים ולפעולת מערכת העצבים. נמצא כמעט רק במזון מן החי, אז מי שלא אוכל אותו צריך תוסף.' },
  'ויטמין A (מק״ג)': { why: 'נחוץ לראייה, במיוחד בחושך, למערכת החיסון ולעור. נמצא בכבד, בביצים ובמוצרי חלב, ובצורת בטא־קרוטן בגזר, בבטטה ובירקות עלים.' },
  'ויטמין D (מק״ג)': { why: 'עוזר לגוף לספוג סידן ולשמור על העצמות, ונחוץ לשרירים ולמערכת החיסון. רובו נוצר בעור מהשמש; מעט מאוד מזונות מכילים אותו, אז מאוכל לבד קשה להגיע ליעד.' },
  'ויטמין E (מ״ג)': { why: 'נוגד חמצון שמגן על התאים. נמצא באגוזים, בזרעים ובשמנים צמחיים.' },
  'ויטמין K (מק״ג)': { why: 'נחוץ לקרישת הדם ולבריאות העצם. נמצא בעיקר בירקות עלים ירוקים.' },
  'ויטמין C (מ״ג)': { why: 'נוגד חמצון, נחוץ ליצירת קולגן (עור, כלי דם, ריפוי פצעים) ולמערכת החיסון, ומשפר את ספיגת הברזל מהצומח. נמצא בפירות וירקות.' },
  'ויטמין B1 (מ״ג)': { why: 'תיאמין: עוזר להפיק אנרגיה מהמזון, בעיקר מפחמימות, ונחוץ לפעולת העצבים.' },
  'ויטמין B2 (מ״ג)': { why: 'ריבופלבין: עוזר להפיק אנרגיה מהמזון ונחוץ לגדילת התאים ולפעולתם.' },
  'ויטמין B3 (מ״ג)': { why: 'ניאצין: עוזר להפיק אנרגיה מהמזון, ונחוץ לעור, למערכת העצבים ולמערכת העיכול.' },
  'ויטמין B5 (מ״ג)': { why: 'חומצה פנטותנית: עוזרת להפיק אנרגיה מהמזון ולבנות שומנים והורמונים. נמצאת כמעט בכל מזון, וחוסר נדיר.' },
  'ויטמין B6 (מ״ג)': { why: 'נחוץ לפירוק חלבון, למערכת העצבים וליצירת תאי דם אדומים.' },
  'ביוטין (מק״ג)': { why: 'עוזר לפרק שומן, פחמימות וחלבון. חוסר נדיר. מנות גבוהות בתוספים משבשות חלק מבדיקות הדם, אז כדאי לספר עליהן לפני בדיקה.' },
  'חומצה פולית (מק״ג)': { why: 'נחוצה ליצירת תאים חדשים ותאי דם. חשובה במיוחד לפני היריון ובתחילתו, למניעת מומים בעמוד השדרה של העובר.' },
  'ברזל (מ״ג)': { why: 'נושא את החמצן בדם. מבשר ודגים הוא נספג טוב יותר מאשר מהצומח; ויטמין C באותה ארוחה משפר את הספיגה מהצומח.', goal: 'זה הצורך של נשים בגיל 19 עד 50. גברים, ונשים אחרי גיל 50, צריכים 8 מ״ג.' },
  'מגנזיום (מ״ג)': { why: 'משתתף במאות תהליכים בגוף: פעולת השרירים והעצבים, איזון הסוכר ולחץ הדם, ובניית העצם. נמצא באגוזים, זרעים, קטניות ודגנים מלאים.' },
  'אבץ (מ״ג)': { why: 'נחוץ למערכת החיסון, לריפוי פצעים ולחוש הטעם והריח.' },
  'סלניום (מק״ג)': { why: 'נוגד חמצון, ונחוץ לפעולת בלוטת התריס.' },
  'יוד (מק״ג)': { why: 'נחוץ ליצירת הורמוני בלוטת התריס. בישראל חסר ביוד נפוץ, בין השאר כי במי ההתפלה אין כמעט יוד.' },
  'נחושת (מ״ג)': { why: 'נחוצה ליצירת תאי דם אדומים ורקמת חיבור, ועוזרת לגוף להשתמש בברזל.' },
  'מנגן (מ״ג)': { why: 'עוזר לפרק מזון ולבנות עצם, ומשתתף בהגנה מפני חמצון.' },
  'כרום (מק״ג)': { why: 'עוזר לאינסולין לפעול.' },
  'מוליבדן (מק״ג)': { why: 'מפעיל אנזימים שמפרקים חלבונים וחומרים מזיקים. חוסר נדיר מאוד.' },
  'זרחן (מ״ג)': { why: 'בונה עם הסידן את העצמות והשיניים, ונחוץ להפקת אנרגיה בתאים.' },
  'כולין (מ״ג)': { why: 'נחוץ לפעולת הכבד והמוח ולהעברת שומן בגוף. נמצא בביצים, בבשר ובדגים.' },
  'אומגה 3 (מ״ג)': { why: 'שומן חיוני ללב, למוח ולעיניים, שהגוף לא מייצר לבד. נמצא בדגים שמנים, בזרעי פשתן ובאגוזי מלך. אין לו ערך יומי רשמי.' },
};

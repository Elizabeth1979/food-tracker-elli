// Goals from body measurements. Run: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_VALUES, DEFAULT_GOALS, MICRO_INFO, goalsLeft, goalsOf, microLevel, suggestGoals, whatFits, type Body } from './goals.ts';

const her: Body = { sex: 'f', age: 45, heightCm: 165, weightKg: 75, activity: 1.375, aim: -0.2, carbsMax: 130 };

test('losing weight while building muscle: a modest deficit, high protein, macros adding up to the calories', () => {
  const g = suggestGoals(her);
  const keep = suggestGoals({ ...her, aim: 0 });
  assert.ok(g.kcal < keep.kcal && g.kcal >= keep.kcal * 0.75);
  assert.equal(g.protein, 123); // 1.8 g/kg of a BMI-25 weight (68 kg), not of all 75 kg
  assert.ok(Math.abs(g.carbs * 4 + g.fat * 9 + g.protein * 4 - g.kcal) < 15);
});

test('low-carb: carbs stay at 130 g or under, fat takes up the rest', () => {
  const big = suggestGoals({ ...her, weightKg: 95, activity: 1.725, aim: 0 });
  assert.equal(big.carbs, 130);
  assert.ok(Math.abs(big.carbs * 4 + big.fat * 9 + big.protein * 4 - big.kcal) < 15);
});

test('the standard plan: no carb cap, fat at 30% of the calories', () => {
  const g = suggestGoals({ ...her, carbsMax: 0 });
  assert.ok(g.carbs > 130);
  assert.ok(Math.abs((g.fat * 9) / g.kcal - 0.3) < 0.02);
});

test('until goals are tailored, empty ones fall back to the nutrition-label defaults', () => {
  assert.deepEqual(goalsOf(null), DEFAULT_GOALS);
  assert.deepEqual(goalsOf({ kcal: 1800, protein: null }), { ...DEFAULT_GOALS, kcal: 1800 });
});

test('never below resting needs, and more weight or training means more food', () => {
  const sitting = suggestGoals({ ...her, activity: 1.2 });
  assert.ok(sitting.kcal >= 10 * 75 + 6.25 * 165 - 5 * 45 - 161 - 5);
  assert.ok(suggestGoals({ ...her, activity: 1.55 }).kcal > suggestGoals(her).kcal);
  assert.ok(suggestGoals({ ...her, weightKg: 85 }).kcal > suggestGoals(her).kcal);
});

test('what fits: only what fits the calories and carbs left; protein first while protein is short, else most eaten', () => {
  const x = (name: string, kcal: number, carbs: number, protein: number) => ({ name, kcal, carbs, protein, fat: 0 });
  const usual = [x('תפוח', 80, 20, 0), x('יוגורט', 120, 6, 12), x('עוגה', 350, 45, 4), x('קפה', 0, 0, 0), x('לחם', 150, 28, 5)];
  const names = (xs: { name: string }[]) => xs.map((r) => r.name);
  const left = goalsLeft({ kcal: 1800, carbs: 130, fat: 60, protein: 120 }, { kcal: 1600, carbs: 100, fat: 50, protein: 90 });
  assert.deepEqual(left, { kcal: 200, carbs: 30, fat: 10, protein: 30 });
  assert.deepEqual(names(whatFits(usual, left)), ['יוגורט', 'לחם', 'תפוח']); // cake too big, coffee is no food
  assert.deepEqual(names(whatFits(usual, { ...left, protein: 0 })), ['תפוח', 'יוגורט', 'לחם']); // protein met: as given
  assert.deepEqual(names(whatFits(usual, { ...left, carbs: 10 })), ['יוגורט']); // near the carb limit
  assert.deepEqual(names(whatFits(usual, { ...left, kcal: 50 })), []);
  assert.deepEqual(names(whatFits(usual, { ...left, kcal: 50 }, (r) => r.name === 'עוגה')), ['עוגה']);
  assert.equal(whatFits([...usual, ...usual], left).length, 5);
});

test('every vitamin and mineral with a daily value says what it does', () => {
  for (const key of Object.keys(DAILY_VALUES)) assert.ok(MICRO_INFO[key]?.why, key);
});

test("a period's vitamin average: low under 70% of the goal, ok up to it, good from it", () => {
  assert.deepEqual([13.9, 14, 19.9, 20, 30].map((v) => microLevel(v, 20)), ['low', 'ok', 'ok', 'good', 'good']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { regressionPoints, calibrationBins } from '../js/diagnostics.js';

const row = (id, actual, predicted, probability) => ({
  id, basin: 'Test', forecast: { actualChange: actual,
    models: [{ id: 'model', change: predicted }],
    classifiers: [{ id: 'classifier', probability }] }
});
const fixture = () => [row('a', 0, -0.2, 0), row('b', -0.1, 0.3, 0.1),
  row('c', 0.5, 0.4, 0.15), row('d', 1, 2, 1)];

test('regression copies every raw pair without changing records', () => {
  const lakes = fixture(), original = structuredClone(lakes);
  assert.deepEqual(regressionPoints(lakes, 'model'), [
    { id: 'a', basin: 'Test', observed: 0, predicted: -0.2 },
    { id: 'b', basin: 'Test', observed: -0.1, predicted: 0.3 },
    { id: 'c', basin: 'Test', observed: 0.5, predicted: 0.4 },
    { id: 'd', basin: 'Test', observed: 1, predicted: 2 }
  ]);
  assert.deepEqual(lakes, original);
});
test('calibration uses fixed boundaries and strict expansion, including probabilities 0 and 1', () => {
  const lakes = fixture(), original = structuredClone(lakes);
  assert.deepEqual(calibrationBins(lakes, 'classifier'), [
    {index:0, lower:0, upper:0.1, count:1, meanProbability:0, observedFrequency:0},
    {index:1, lower:0.1, upper:0.2, count:2, meanProbability:0.125, observedFrequency:0.5},
    {index:9, lower:0.9, upper:1, count:1, meanProbability:1, observedFrequency:1}
  ]);
  assert.deepEqual(lakes, original);
  assert.equal(calibrationBins(lakes, 'classifier', 1)[0].observedFrequency, 0.5);
});
test('invalid or missing data fails visibly instead of dropping points', () => {
  assert.throws(() => regressionPoints(fixture(), 'missing'));
  assert.throws(() => calibrationBins(fixture(), 'missing'));
  for (const value of [NaN, Infinity, '0.2', undefined]) {
    assert.throws(() => regressionPoints([row('bad', 0, value, 0.5)], 'model'));
    assert.throws(() => regressionPoints([row('bad', value, 0, 0.5)], 'model'));
    assert.throws(() => calibrationBins([row('bad', value, 0, 0.5)], 'classifier'));
  }
  for (const value of [-0.01, 1.01, NaN, Infinity, '0.5', undefined])
    assert.throws(() => calibrationBins([row('bad', 0, 0, value)], 'classifier'));
  for (const count of [0, -1, 1.5, Infinity])
    assert.throws(() => calibrationBins(fixture(), 'classifier', count));
});
test('existing export preserves all 478 pairs for every model and 319 expansion events', async () => {
  const {lakes} = JSON.parse(await readFile(new URL('../data/lakes.json', import.meta.url), 'utf8'));
  assert.equal(lakes.length, 478);
  for (const model of lakes[0].forecast.models) {
    const points = regressionPoints(lakes, model.id);
    assert.equal(points.length, 478);
    points.forEach((point, i) => {
      assert.equal(point.observed, lakes[i].forecast.actualChange);
      assert.equal(point.predicted, lakes[i].forecast.models.find(m=>m.id===model.id).change);
      assert.equal(point.id, lakes[i].id);
    });
  }
  for (const classifier of lakes[0].forecast.classifiers) {
    const bins = calibrationBins(lakes, classifier.id);
    assert.equal(bins.reduce((sum,b)=>sum+b.count,0),478);
    assert.ok(Math.abs(bins.reduce((sum,b)=>sum+b.count*b.observedFrequency,0)-319)<1e-10);
    const expected = lakes.reduce((sum,l)=>sum+l.forecast.classifiers.find(c=>c.id===classifier.id).probability,0);
    assert.ok(Math.abs(bins.reduce((sum,b)=>sum+b.count*b.meanProbability,0)-expected)<1e-10);
  }
});

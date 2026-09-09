// Calculations use the exported evaluation values unchanged; no model fitting occurs here.
function finite(value, description) {
  if (!Number.isFinite(value)) throw new TypeError(`${description} must be finite`);
  return value;
}
function selected(records, id, description) {
  if (typeof id !== 'string' || !id) throw new TypeError(`Missing ${description} id`);
  const record = records?.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`Missing ${description}: ${id}`);
  return record;
}

export function regressionPoints(lakes, modelId) {
  return lakes.map((lake) => ({
    id: lake.id,
    basin: lake.basin,
    observed: finite(lake.forecast?.actualChange, 'Observed change'),
    predicted: finite(selected(lake.forecast?.models, modelId, 'model').change, 'Predicted change'),
  }));
}

// Equal-width [lower, upper) bins; the final bin includes probability 1.
// An observed change of exactly zero is not expansion.
export function calibrationBins(lakes, classifierId, binCount = 10) {
  if (!Number.isInteger(binCount) || binCount < 1)
    throw new RangeError('Bin count must be a positive integer');
  const bins = Array.from({ length: binCount }, (_, index) => ({
    index, lower: index / binCount, upper: (index + 1) / binCount,
    count: 0, probabilitySum: 0, events: 0,
  }));
  for (const lake of lakes) {
    const probability = finite(selected(lake.forecast?.classifiers, classifierId, 'classifier').probability, 'Probability');
    if (probability < 0 || probability > 1)
      throw new RangeError('Probability must be between 0 and 1');
    const observed = finite(lake.forecast?.actualChange, 'Observed change');
    const bin = bins[Math.min(Math.floor(probability * binCount), binCount - 1)];
    bin.count += 1;
    bin.probabilitySum += probability;
    bin.events += Number(observed > 0);
  }
  return bins.filter((bin) => bin.count > 0).map((bin) => ({
    index: bin.index, lower: bin.lower, upper: bin.upper, count: bin.count,
    meanProbability: bin.probabilitySum / bin.count,
    observedFrequency: bin.events / bin.count,
  }));
}

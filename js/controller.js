/** Faithful scalar port of src/task2/{membership,flc,safety}.py. */
const clip = (value, [lower, upper]) => Math.min(upper, Math.max(lower, value));
const finiteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

export function membership(value, set) {
  let result;
  if (set.left_shoulder) {
    result = value <= set.centre ? 1 : 1 - (value - set.centre) / set.width;
  } else if (set.right_shoulder) {
    result = value >= set.centre ? 1 : 1 - (set.centre - value) / set.width;
  } else {
    result = 1 - Math.abs(value - set.centre) / set.width;
  }
  return clip(result, [0, 1]);
}

export function evaluateController(
  config,
  { error, outdoor, manualOverride = null },
) {
  const empty = {
    command: 0,
    status: "sensor_fault",
    clipped: false,
    activeRules: [],
    outputGrid: [],
    aggregatedMembership: [],
    boundedInputs: null,
  };
  // Override precedence is intentional: it also applies with invalid sensors.
  if (manualOverride !== null) {
    if (!finiteNumber(manualOverride))
      return { ...empty, status: "invalid_manual_override" };
    const command = clip(manualOverride, config.universes.output);
    return {
      ...empty,
      command,
      status: "manual_override",
      clipped: command !== manualOverride,
    };
  }
  if (!finiteNumber(error) || !finiteNumber(outdoor)) return empty;
  const boundedError = clip(error, config.universes.error);
  const boundedOutdoor = clip(outdoor, config.universes.outdoor);
  const clipped = boundedError !== error || boundedOutdoor !== outdoor;
  const errorMemberships = config.sets.error.map((set) =>
    membership(boundedError, set),
  );
  const outdoorMemberships = config.sets.outdoor.map((set) =>
    membership(boundedOutdoor, set),
  );
  const consequentStrengths = config.sets.output.map(() => 0);
  const activeRules = [];
  config.rule_table.forEach((row, ei) =>
    row.forEach((consequent, oi) => {
      const strength = Math.min(errorMemberships[ei], outdoorMemberships[oi]);
      consequentStrengths[consequent] = Math.max(
        consequentStrengths[consequent],
        strength,
      );
      if (strength > 0)
        activeRules.push({
          index: ei * config.sets.outdoor.length + oi,
          errorSet: config.sets.error[ei].name,
          outdoorSet: config.sets.outdoor[oi].name,
          outputSet: config.sets.output[consequent].name,
          strength,
        });
    }),
  );
  const [lower, upper] = config.universes.output;
  const count = config.output_grid_points;
  const step = (upper - lower) / (count - 1);
  const outputGrid = Array.from({ length: count }, (_, i) =>
    i === count - 1 ? upper : lower + i * step,
  );
  const aggregatedMembership = outputGrid.map((value) =>
    Math.max(
      ...config.sets.output.map((set, i) =>
        Math.min(consequentStrengths[i], membership(value, set)),
      ),
    ),
  );
  let denominator = 0;
  let numerator = 0;
  for (let i = 1; i < count; i++) {
    const dx = outputGrid[i] - outputGrid[i - 1];
    denominator +=
      (dx * (aggregatedMembership[i] + aggregatedMembership[i - 1])) / 2;
    numerator +=
      (dx *
        (aggregatedMembership[i] * outputGrid[i] +
          aggregatedMembership[i - 1] * outputGrid[i - 1])) /
      2;
  }
  const active = denominator > Number.EPSILON;
  return {
    command: active
      ? clip(numerator / denominator, config.universes.output)
      : 0,
    status: active
      ? clipped
        ? "input_clipped"
        : "automatic"
      : "no_rule_activation",
    clipped,
    activeRules,
    outputGrid,
    aggregatedMembership,
    boundedInputs: { error: boundedError, outdoor: boundedOutdoor },
  };
}

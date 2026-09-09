const NS = "http://www.w3.org/2000/svg";
export function svgNode(tag, attributes = {}, text) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attributes).forEach(([key, value]) =>
    node.setAttribute(key, value),
  );
  if (text !== undefined) node.textContent = text;
  return node;
}
function chartRoot(container, width, height, description) {
  const svg = svgNode("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": description,
  });
  container.replaceChildren(svg);
  svg.append(svgNode("title", {}, description));
  return svg;
}
const line = (svg, x1, y1, x2, y2, attrs = {}) =>
  svg.append(svgNode("line", { x1, y1, x2, y2, ...attrs }));
const label = (svg, x, y, value, attrs = {}) =>
  svg.append(svgNode("text", { x, y, ...attrs }, value));
const pathOf = (points) =>
  points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
const areaFormat = (value) =>
  value === 0
    ? "0"
    : value >= 10
      ? value.toFixed(1)
      : value >= 1
        ? value.toFixed(2)
        : value.toFixed(3);

export function drawHistory(container, lake, model, level) {
  const f = lake.forecast;
  const history = lake.history.filter((point) => point.year <= f.baseYear);
  const predicted = f.baseArea * (1 + model.change);
  const lower = f.baseArea * (1 + model.lower);
  const upper = f.baseArea * (1 + model.upper);
  const values = [
    ...history.map((point) => point.area),
    predicted,
    lower,
    upper,
    f.actualArea,
  ];
  const min = Math.max(
    0,
    Math.min(...values) - (Math.max(...values) - Math.min(...values)) * 0.16,
  );
  const max =
    Math.max(...values) + Math.max((Math.max(...values) - min) * 0.12, 0.0001);
  const w = 700,
    h = 300,
    left = 65,
    right = 31,
    top = 27,
    bottom = 44;
  const first = Math.min(2017, ...history.map((point) => point.year));
  const x = (year) =>
    left + ((year - first) / (f.targetYear - first + 0.4)) * (w - left - right);
  const y = (area) =>
    h - bottom - ((area - min) / (max - min)) * (h - top - bottom);
  const summary = `${lake.id}. ${model.name}: predicted ${predicted.toFixed(4)} square kilometres in ${f.targetYear}; observed ${f.actualArea.toFixed(4)}. Nominal ${level * 100}% interval ${lower.toFixed(4)} to ${upper.toFixed(4)} square kilometres.`;
  const svg = chartRoot(container, w, h, summary);
  const boundary = (x(f.baseYear) + x(f.targetYear)) / 2;
  svg.append(
    svgNode("rect", {
      x: boundary,
      y: top,
      width: w - right - boundary,
      height: h - top - bottom,
      fill: "#f0f7fa",
      rx: 3,
    }),
  );
  label(svg, boundary + 8, 17, "Held-out year", {
    class: "axis-label",
    fill: "#17628a",
  });
  for (let i = 0; i <= 4; i++) {
    const value = min + ((max - min) * i) / 4;
    line(svg, left, y(value), w - right, y(value), {
      stroke: "#e2eaf0",
      "stroke-width": 1,
    });
    label(svg, left - 11, y(value) + 4, areaFormat(value), {
      "text-anchor": "end",
    });
  }
  for (let year = first; year <= f.targetYear; year++)
    label(svg, x(year), h - 18, String(year), { "text-anchor": "middle" });
  // Separate consecutive segments so unavailable history is never interpolated.
  history.forEach((point, i) => {
    const previous = history[i - 1];
    if (previous && point.year === previous.year + 1)
      line(
        svg,
        x(previous.year),
        y(previous.area),
        x(point.year),
        y(point.area),
        { stroke: "#607f92", "stroke-width": 2 },
      );
    const dot = svgNode("circle", {
      cx: x(point.year),
      cy: y(point.area),
      r: 3.5,
      fill: "#607f92",
      stroke: "#fff",
      "stroke-width": 1.5,
    });
    dot.append(
      svgNode("title", {}, `${point.year}: ${point.area.toFixed(5)} km²`),
    );
    svg.append(dot);
  });
  const px = x(f.targetYear) - 9,
    ax = x(f.targetYear) + 9;
  line(svg, x(f.baseYear), y(f.baseArea), px, y(predicted), {
    stroke: "#17628a",
    "stroke-width": 1.7,
    "stroke-dasharray": "5 5",
  });
  svg.append(
    svgNode("rect", {
      x: px - 8,
      y: y(upper),
      width: 16,
      height: y(lower) - y(upper),
      fill: "#c8e2ee",
      opacity: 0.8,
    }),
  );
  line(svg, px, y(lower), px, y(upper), {
    stroke: "#72a8c1",
    "stroke-width": 1.5,
  });
  [lower, upper].forEach((v) =>
    line(svg, px - 9, y(v), px + 9, y(v), {
      stroke: "#72a8c1",
      "stroke-width": 2,
    }),
  );
  const dot = svgNode("circle", {
    cx: px,
    cy: y(predicted),
    r: 5.5,
    fill: "#17628a",
    stroke: "#fff",
    "stroke-width": 2,
  });
  dot.append(svgNode("title", {}, `Forecast: ${predicted.toFixed(5)} km²`));
  svg.append(dot);
  const actual = svgNode("rect", {
    x: ax - 4,
    y: y(f.actualArea) - 4,
    width: 8,
    height: 8,
    fill: "#172e49",
  });
  actual.append(
    svgNode(
      "title",
      {},
      `Observed ${f.targetYear}: ${f.actualArea.toFixed(5)} km²`,
    ),
  );
  svg.append(actual);
}

export function drawMembership(container, result, config, membership) {
  const w = 700,
    h = 210,
    left = 42,
    right = 20,
    top = 23,
    bottom = 39;
  const [lo, hi] = config.universes.output;
  const x = (value) => left + ((value - lo) / (hi - lo)) * (w - left - right);
  const y = (value) => h - bottom - value * (h - top - bottom);
  const svg = chartRoot(
    container,
    w,
    h,
    result.outputGrid.length
      ? `Aggregated fuzzy membership with centroid command ${result.command.toFixed(2)} percent.`
      : "Automatic inference is bypassed. No aggregated membership is computed.",
  );
  if (!result.outputGrid.length) {
    label(svg, w / 2, h / 2, "Automatic inference is bypassed", {
      "text-anchor": "middle",
    });
    label(
      svg,
      w / 2,
      h / 2 + 25,
      "The manual command goes directly to the output.",
      { "text-anchor": "middle", class: "axis-label" },
    );
    return;
  }
  [0, 0.5, 1].forEach((v) => {
    line(svg, left, y(v), w - right, y(v), { stroke: "#e2eaf0" });
    label(svg, left - 10, y(v) + 4, v.toFixed(1), { "text-anchor": "end" });
  });
  [-100, -50, 0, 50, 100].forEach((v) =>
    label(svg, x(v), h - 15, `${v}%`, { "text-anchor": "middle" }),
  );
  for (const set of config.sets.output) {
    const points = result.outputGrid.map((value) => [
      x(value),
      y(membership(value, set)),
    ]);
    svg.append(
      svgNode("path", {
        d: pathOf(points),
        fill: "none",
        stroke: "#d5e0e9",
        "stroke-width": 1,
      }),
    );
  }
  const points = result.outputGrid.map((value, i) => [
    x(value),
    y(result.aggregatedMembership[i]),
  ]);
  const fillPath = `${pathOf([[x(lo), y(0)], ...points, [x(hi), y(0)]])} Z`;
  svg.append(
    svgNode("path", { d: fillPath, fill: "#abd3e5", "fill-opacity": 0.65 }),
  );
  svg.append(
    svgNode("path", {
      d: pathOf(points),
      fill: "none",
      stroke: "#17628a",
      "stroke-width": 2,
    }),
  );
  line(svg, x(result.command), top, x(result.command), y(0), {
    stroke: "#172e49",
    "stroke-width": 1.5,
    "stroke-dasharray": "4 4",
  });
  label(
    svg,
    Math.min(w - 75, Math.max(left + 45, x(result.command))),
    15,
    "Centroid",
    { "text-anchor": "middle", class: "axis-label" },
  );
}

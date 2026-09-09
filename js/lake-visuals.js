import { svgNode } from "./charts.js";

const colours = { Karnali: "#26788d", Gandaki: "#bd762a", Koshi: "#7465a2" };
const pct = (value) =>
  `${(value * 100).toFixed(Math.abs(value) < 0.1 && value !== 0 ? 1 : 0)}%`;
const path = (points) =>
  points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
function root(container, w, h, description) {
  const svg = svgNode("svg", {
    viewBox: `0 0 ${w} ${h}`,
    role: "img",
    "aria-label": description,
  });
  svg.append(svgNode("title", {}, description));
  container.replaceChildren(svg);
  return svg;
}
const line = (svg, x1, y1, x2, y2, attrs = {}) =>
  svg.append(svgNode("line", { x1, y1, x2, y2, ...attrs }));
const label = (svg, x, y, value, attrs = {}) =>
  svg.append(svgNode("text", { x, y, ...attrs }, value));

export function drawLocation(container, lakes, selected, outline) {
  const w = 660,
    h = 310,
    pad = 28;
  const rings =
    outline?.geometry?.type === "Polygon" ? outline.geometry.coordinates : [];
  const coordinates = [
    ...rings.flat(),
    ...lakes.map((lake) => [lake.lon, lake.lat]),
  ];
  const lonMin = Math.min(...coordinates.map((p) => p[0])),
    lonMax = Math.max(...coordinates.map((p) => p[0]));
  const latMin = Math.min(...coordinates.map((p) => p[1])),
    latMax = Math.max(...coordinates.map((p) => p[1]));
  // Equirectangular projection with local standard parallel; north remains up.
  const correction = Math.cos((((latMin + latMax) / 2) * Math.PI) / 180);
  const scale = Math.min(
    (w - pad * 2) / ((lonMax - lonMin) * correction),
    (h - pad * 2) / (latMax - latMin),
  );
  const project = ([lon, lat]) => [
    w / 2 + (lon - (lonMin + lonMax) / 2) * correction * scale,
    h / 2 - (lat - (latMin + latMax) / 2) * scale,
  ];
  const svg = root(
    container,
    w,
    h,
    `Locations of all ${lakes.length} evaluated lakes in Nepal, coloured by basin.${selected ? ` Selected ${selected.id}, ${selected.basin} basin.` : " No lake selected."}`,
  );
  if (rings.length)
    svg.append(
      svgNode("path", {
        d: rings.map((ring) => `${path(ring.map(project))} Z`).join(" "),
        class: "nepal-outline",
        fill: "#edf3ee",
        stroke: "#96ada5",
        "stroke-width": 1.5,
        "fill-rule": "evenodd",
      }),
    );
  for (const lake of lakes) {
    const [cx, cy] = project([lake.lon, lake.lat]);
    const dot = svgNode("circle", {
      cx,
      cy,
      r: 2.6,
      fill: colours[lake.basin] || "#53667a",
      opacity: 0.55,
      "data-lake-id": lake.id,
    });
    dot.append(
      svgNode(
        "title",
        {},
        `${lake.id}: ${lake.basin}, ${lake.lat.toFixed(4)}° N, ${lake.lon.toFixed(4)}° E`,
      ),
    );
    svg.append(dot);
  }
  if (selected) {
    const [cx, cy] = project([selected.lon, selected.lat]);
    svg.append(
      svgNode("circle", {
        cx,
        cy,
        r: 8,
        fill: "#fff",
        stroke: "#172e49",
        "stroke-width": 2,
        class: "selected-lake",
        "data-selected-id": selected.id,
      }),
    );
    svg.append(svgNode("circle", { cx, cy, r: 3, fill: "#172e49" }));
  }
  line(svg, w - 25, 47, w - 25, 25, { stroke: "#53667a", "stroke-width": 1.4 });
  svg.append(
    svgNode("path", {
      d: `M${w - 30},31 L${w - 25},24 L${w - 20},31`,
      stroke: "#53667a",
      fill: "none",
    }),
  );
  label(svg, w - 25, 17, "N", { "text-anchor": "middle" });
  label(svg, 30, h - 9, "Generalised location map", { class: "axis-label" });
}

export function drawScatter(
  container,
  points,
  selectedId,
  modelName,
  scaleType = "linear",
) {
  const w = 450,
    h = 390,
    left = 65,
    right = 18,
    top = 22,
    bottom = 62;
  const values = points.flatMap((p) => [p.observed, p.predicted]);
  const rawLow = Math.min(0, ...values),
    rawHigh = Math.max(0, ...values);
  const padding = (rawHigh - rawLow) * 0.06 || 0.1;
  const low = Math.max(-1, rawLow - padding),
    high = rawHigh + padding;
  const transform =
    scaleType === "symlog"
      ? (value) => Math.sign(value) * Math.log1p(Math.abs(value) / 0.1)
      : (value) => value;
  const from = transform(low),
    to = transform(high);
  const size = Math.min(w - left - right, h - top - bottom);
  const x = (value) => left + ((transform(value) - from) / (to - from)) * size;
  const y = (value) =>
    top + size - ((transform(value) - from) / (to - from)) * size;
  const description = `${modelName}: predicted versus observed 2024 proportional area change for all ${points.length} lakes. Both axes use ${scaleType === "symlog" ? "symmetric logarithmic" : "linear"} scaling. Diagonal represents perfect predictions. All points are included.`;
  const svg = root(container, w, h, description);
  let ticks;
  if (scaleType === "symlog")
    ticks = [-1, -0.5, -0.1, 0, 0.1, 0.5, 1, 2, 5, 10, 20, 50].filter(
      (v) => v >= low && v <= high,
    );
  else {
    const rough = (high - low) / 8,
      magnitude = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 5, 10]
      .map((m) => m * magnitude)
      .find((v) => v >= rough);
    ticks = Array.from(
      { length: 8 },
      (_, i) => (Math.ceil(low / step) + i) * step,
    ).filter((v) => v <= high);
  }
  if (scaleType === "symlog") {
    const spaced = [0];
    for (const side of [-1, 1]) {
      let previous = 0;
      for (const value of ticks
        .filter((value) => Math.sign(value) === side)
        .sort((a, b) => Math.abs(a) - Math.abs(b))) {
        if (Math.abs(x(value) - x(previous)) >= 40) {
          spaced.push(value);
          previous = value;
        }
      }
    }
    ticks = spaced.sort((a, b) => a - b);
  }
  for (const value of ticks) {
    line(svg, x(value), top, x(value), top + size, { stroke: "#e4ebf1" });
    line(svg, left, y(value), left + size, y(value), { stroke: "#e4ebf1" });
    label(svg, x(value), top + size + 20, pct(value), {
      "text-anchor": "middle",
    });
    label(svg, left - 9, y(value) + 4, pct(value), { "text-anchor": "end" });
  }
  line(svg, x(low), y(low), x(high), y(high), {
    stroke: "#8a9aa8",
    "stroke-width": 1.5,
    "stroke-dasharray": "5 4",
  });
  for (const point of points) {
    const dot = svgNode("circle", {
      cx: x(point.observed),
      cy: y(point.predicted),
      r: 2.8,
      fill: "#17628a",
      opacity: 0.38,
      "data-point-id": point.id,
      "data-observed": point.observed,
      "data-predicted": point.predicted,
    });
    dot.append(
      svgNode(
        "title",
        {},
        `${point.id}: observed ${pct(point.observed)}, predicted ${pct(point.predicted)}`,
      ),
    );
    svg.append(dot);
  }
  const selected = points.find((point) => point.id === selectedId);
  if (selected)
    svg.append(
      svgNode("circle", {
        cx: x(selected.observed),
        cy: y(selected.predicted),
        r: 6,
        fill: "none",
        stroke: "#b55020",
        "stroke-width": 2,
      }),
    );
  label(svg, left + size / 2, h - 12, "Observed area change", {
    "text-anchor": "middle",
  });
  label(svg, 17, top + size / 2, "Predicted area change", {
    "text-anchor": "middle",
    transform: `rotate(-90 17 ${top + size / 2})`,
  });
}

export function drawCalibration(container, bins, classifierName) {
  const w = 450,
    h = 390,
    left = 65,
    top = 22,
    size = 306;
  const x = (p) => left + p * size,
    y = (p) => top + (1 - p) * size;
  const count = bins.reduce((sum, bin) => sum + bin.count, 0);
  const svg = root(
    container,
    w,
    h,
    `${classifierName}: reliability diagram over ${count} evaluated lakes, using ten equal-width probability bins. Empty bins omitted. Points compare mean predicted probability with observed expansion frequency.`,
  );
  for (const value of [0, 0.25, 0.5, 0.75, 1]) {
    line(svg, x(value), top, x(value), top + size, { stroke: "#e4ebf1" });
    line(svg, left, y(value), left + size, y(value), { stroke: "#e4ebf1" });
    label(svg, x(value), top + size + 20, pct(value), {
      "text-anchor": "middle",
    });
    label(svg, left - 9, y(value) + 4, pct(value), { "text-anchor": "end" });
  }
  line(svg, x(0), y(0), x(1), y(1), {
    stroke: "#8a9aa8",
    "stroke-width": 1.5,
    "stroke-dasharray": "5 4",
  });
  for (const bin of bins) {
    const dot = svgNode("circle", {
      cx: x(bin.meanProbability),
      cy: y(bin.observedFrequency),
      r: Math.max(4, Math.sqrt(bin.count) * 0.65),
      fill: "#7465a2",
      "fill-opacity": 0.65,
      stroke: "#fff",
      "stroke-width": 1.5,
      "data-bin-index": bin.index,
      "data-count": bin.count,
      "data-frequency": bin.observedFrequency,
    });
    dot.append(
      svgNode(
        "title",
        {},
        `${pct(bin.lower)}–${pct(bin.upper)}: ${bin.count} lakes, mean probability ${pct(bin.meanProbability)}, observed expansion ${pct(bin.observedFrequency)}`,
      ),
    );
    svg.append(dot);
  }
  label(svg, left + size / 2, h - 12, "Mean predicted expansion probability", {
    "text-anchor": "middle",
  });
  label(svg, 17, top + size / 2, "Observed expansion frequency", {
    "text-anchor": "middle",
    transform: `rotate(-90 17 ${top + size / 2})`,
  });
}

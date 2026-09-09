import { evaluateController, membership } from "./controller.js";
import { drawHistory, drawMembership } from "./charts.js";
import { drawLocation, drawScatter, drawCalibration } from "./lake-visuals.js";
import { regressionPoints, calibrationBins } from "./diagnostics.js";

const $ = (id) => document.getElementById(id);
const text = (id, value) => {
  $(id).textContent = value;
};
const pct = (value, digits = 1, signed = false) =>
  `${signed && value > 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
const niceName = (value) => value.replaceAll("_", " ");
const el = (tag, content, className) => {
  const element = document.createElement(tag);
  if (content !== undefined) element.textContent = content;
  if (className) element.className = className;
  return element;
};
let lakeData, currentLake, controllerConfig;
let nepalOutline = null;

function activateTab(name, focus = false) {
  if (!["lakes", "controller", "evidence"].includes(name)) name = "lakes";
  document.querySelectorAll("[data-tab]").forEach((button) => {
    const active = button.dataset.tab === name;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    $(`panel-${button.dataset.tab}`).hidden = !active;
    if (active && focus) button.focus();
  });
}
document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    history.replaceState(null, "", `#${button.dataset.tab}`);
    activateTab(button.dataset.tab);
  });
  button.addEventListener("keydown", (event) => {
    const tabs = [...document.querySelectorAll("[data-tab]")];
    let index = tabs.indexOf(button);
    if (event.key === "ArrowRight") index = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      index = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = tabs.length - 1;
    else return;
    event.preventDefault();
    history.replaceState(null, "", `#${tabs[index].dataset.tab}`);
    activateTab(tabs[index].dataset.tab, true);
  });
});
window.addEventListener("hashchange", () =>
  activateTab(location.hash.slice(1)),
);
activateTab(location.hash.slice(1));
document
  .querySelectorAll("[data-reload]")
  .forEach((button) =>
    button.addEventListener("click", () => location.reload()),
  );

function addOptions(select, options, previous) {
  select.replaceChildren(
    ...options.map(({ id, name }) => new Option(name, id)),
  );
  if (options.some((option) => option.id === previous)) select.value = previous;
}
function filterLakes() {
  const basin = $("basin-select").value;
  const query = $("lake-search").value.trim().toLowerCase();
  const visible = lakeData.lakes.filter(
    (lake) =>
      (basin === "all" || lake.basin === basin) &&
      lake.id.toLowerCase().includes(query),
  );
  const previous = $("lake-select").value;
  addOptions(
    $("lake-select"),
    visible.map((lake) => ({ id: lake.id, name: lake.id.replace("GLO_", "") })),
    previous,
  );
  text("lake-count", `${visible.length} of ${lakeData.lakes.length}`);
  $("no-lakes").hidden = visible.length > 0;
  $("lake-select").disabled = !visible.length;
  $("download-lake").disabled = !visible.length;
  $("model-select").disabled = !visible.length;
  $("lake-detail").hidden = !visible.length;
  if (!visible.length) {
    currentLake = null;
    text("lake-coordinates", "");
    renderLakeVisuals();
    $("probabilities").replaceChildren(
      el("p", "Select a matching lake to see its probabilities.", "hint"),
    );
    return;
  }
  renderLake();
}
function renderLake() {
  currentLake = lakeData.lakes.find(
    (lake) => lake.id === $("lake-select").value,
  );
  if (!currentLake) return;
  const model = currentLake.forecast.models.find(
    (item) => item.id === $("model-select").value,
  );
  if (!model)
    throw new Error(
      "Selected regression model is not available in this record.",
    );
  renderLakeVisuals();
  text("lake-heading", currentLake.id);
  text("lake-basin", `${currentLake.basin} basin · Nepal`);
  text(
    "lake-coordinates",
    `${currentLake.lat.toFixed(4)}° N, ${currentLake.lon.toFixed(4)}° E`,
  );
  text("forecast-value", pct(model.change, 1, true));
  text("actual-value", pct(currentLake.forecast.actualChange, 1, true));
  text("forecast-model-name", model.name);
  text(
    "interval-value",
    `${pct(model.lower, 1, true)} to ${pct(model.upper, 1, true)}`,
  );
  const level = `${Math.round(lakeData.meta.intervalLevel * 100)}% prediction interval`;
  text("interval-label", level);
  text("interval-legend", level);
  drawHistory(
    $("history-chart"),
    currentLake,
    model,
    lakeData.meta.intervalLevel,
  );
  $("probabilities").replaceChildren(
    ...currentLake.forecast.classifiers.map((classifier) => {
      const row = el("div", undefined, "probability-row");
      row.append(
        el("span", classifier.name),
        el("strong", pct(classifier.probability)),
      );
      const track = el("div", undefined, "probability-track");
      track.setAttribute("aria-hidden", "true");
      const fill = el("span");
      fill.style.width = pct(classifier.probability, 4);
      track.append(fill);
      row.append(track);
      return row;
    }),
  );
}
function renderMetrics() {
  const regression = lakeData.metrics
    .filter((item) => item.task === "regression")
    .sort((a, b) => a.proportional_mae - b.proportional_mae);
  $("metrics-body").replaceChildren(
    ...regression.map((item, i) => {
      const row = el("tr");
      if (i === 0) row.className = "best";
      [
        item.name,
        item.proportional_mae.toFixed(4),
        item.proportional_rmse.toFixed(4),
        pct(item.interval_coverage),
        item.mean_interval_score.toFixed(4),
      ].forEach((value) => row.append(el("td", value)));
      return row;
    }),
  );
  $("classifier-metrics").replaceChildren(
    ...lakeData.metrics
      .filter((item) => item.task === "classification")
      .map((item) => {
        const row = el("tr");
        [
          item.name,
          item.brier.toFixed(4),
          item.log_loss.toFixed(4),
          item.pr_auc.toFixed(4),
        ].forEach((value) => row.append(el("td", value)));
        return row;
      }),
  );
  text("provenance-detail", JSON.stringify(lakeData.meta, null, 2));
  if (lakeData.meta.dataset) {
    const attribution = $("dataset-attribution");
    attribution.replaceChildren(
      el(
        "span",
        "Nepal glacial-lake inventory: Rawlins et al., version 1.02. Licensed under CC BY 4.0. This site presents an evaluated subset, transformed model outputs and derived metrics. ",
      ),
    );
    const link = el("a", "Source dataset");
    link.href = "https://doi.org/10.5281/zenodo.19370146";
    link.target = "_blank";
    link.rel = "noopener";
    attribution.append(link);
  }
}
async function loadLakes() {
  try {
    const response = await fetch("data/lakes.json");
    if (!response.ok) throw new Error(`Lake data HTTP ${response.status}`);
    lakeData = await response.json();
    if (!lakeData.lakes?.length || !lakeData.metrics?.length)
      throw new Error("Lake data are empty.");
    const basins = [
      ...new Set(lakeData.lakes.map((lake) => lake.basin)),
    ].sort();
    basins.forEach((basin) => $("basin-select").add(new Option(basin, basin)));
    addOptions(
      $("model-select"),
      lakeData.lakes[0].forecast.models,
      "svgp-gpr-history-matern32-256",
    );
    addOptions(
      $("diagnostic-model-select"),
      lakeData.lakes[0].forecast.models,
      $("model-select").value,
    );
    addOptions(
      $("classifier-select"),
      lakeData.lakes[0].forecast.classifiers,
      "svgp-gpc-history_physical-matern32-256",
    );
    filterLakes();
    renderReliability();
    renderMetrics();
    $("lake-loading").hidden = true;
    $("lake-content").hidden = false;
  } catch (error) {
    console.error("Lake explorer:", error);
    $("lake-loading").hidden = true;
    $("lake-error").hidden = false;
    text(
      "provenance-detail",
      "Lake data are unavailable. Reload the page to try again.",
    );
  }
}
$("basin-select").addEventListener("change", filterLakes);
$("lake-search").addEventListener("input", filterLakes);
$("lake-select").addEventListener("change", renderLake);
$("model-select").addEventListener("change", renderLake);
$("download-lake").addEventListener("click", () => {
  if (!currentLake) return;
  const blob = new Blob(
    [JSON.stringify({ meta: lakeData.meta, lake: currentLake }, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    link = el("a");
  link.href = url;
  link.download = `${currentLake.id}-2024.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function renderController() {
  if (!controllerConfig) return;
  const error = Number($("error-input").value),
    outdoor = Number($("outdoor-input").value);
  const manual = $("override-enabled").checked;
  const manualValue = Number($("override-input").value);
  $("override-input").disabled = !manual;
  text("error-output", `${error > 0 ? "+" : ""}${error.toFixed(1)} °C`);
  text("outdoor-output", `${outdoor.toFixed(1)} °C`);
  text("override-output", `${manualValue > 0 ? "+" : ""}${manualValue}%`);
  const result = evaluateController(controllerConfig, {
    error,
    outdoor,
    manualOverride: manual ? manualValue : null,
  });
  const command = Math.abs(result.command) < 0.000001 ? 0 : result.command;
  text("command-value", `${command > 0 ? "+" : ""}${command.toFixed(1)}%`);
  $("command-value").dataset.command = result.command;
  const color =
    command > 0.01 ? "#b55020" : command < -0.01 ? "#2465ad" : "#53667a";
  $("command-value").style.color = color;
  text(
    "command-label",
    command > 0.01 ? "Heating" : command < -0.01 ? "Cooling" : "Neutral",
  );
  text(
    "room-description",
    manual
      ? "Automatic control is bypassed."
      : error > 0
        ? `Room is ${error.toFixed(1)} °C below preference.`
        : error < 0
          ? `Room is ${Math.abs(error).toFixed(1)} °C above preference.`
          : "Room is at the preferred temperature.",
  );
  const statuses = {
    automatic: "Automatic",
    manual_override: "Manual override",
    input_clipped: "Inputs clipped",
    sensor_fault: "Sensor fault",
    invalid_manual_override: "Invalid override",
    no_rule_activation: "No active rules",
  };
  text("controller-status", statuses[result.status] || result.status);
  $("controller-status").classList.toggle("manual", manual);
  $("gauge-fill").style.left = `${Math.min(50, 50 + command / 2)}%`;
  $("gauge-fill").style.width = `${Math.abs(command) / 2}%`;
  $("gauge-fill").style.backgroundColor = color;
  $("gauge-marker").style.left = `${50 + command / 2}%`;
  document.querySelector(".airflow").style.stroke = color;
  text("rules-count", `${result.activeRules.length} of 15 rules active`);
  text(
    "aggregation-caption",
    manual
      ? "Manual override sets the output directly; the fuzzy rules are bypassed."
      : "The shaded area combines active output sets. Its centroid gives the command.",
  );
  drawMembership($("membership-chart"), result, controllerConfig, membership);
  if (!result.activeRules.length) {
    $("active-rules").replaceChildren(
      el(
        "p",
        manual
          ? "Manual override is active. Turn it off to inspect the automatic rules."
          : "No fuzzy rules are active for these inputs.",
        "rule-empty",
      ),
    );
  } else {
    $("active-rules").replaceChildren(
      ...result.activeRules.map((rule) => {
        const row = el("div", undefined, "rule-row");
        const wording = el(
          "div",
          `If ${niceName(rule.errorSet)} and outdoors ${niceName(rule.outdoorSet)}, then ${niceName(rule.outputSet)}.`,
        );
        wording.append(
          el(
            "small",
            `Rule ${rule.index + 1} · minimum of the two input memberships`,
          ),
        );
        row.append(wording, el("strong", pct(rule.strength, 0)));
        return row;
      }),
    );
  }
}
async function loadController() {
  try {
    const response = await fetch("data/controller.json");
    if (!response.ok)
      throw new Error(`Controller data HTTP ${response.status}`);
    controllerConfig = await response.json();
    for (const [id, domain] of [
      ["error-input", "error"],
      ["outdoor-input", "outdoor"],
      ["override-input", "output"],
    ]) {
      $(id).min = controllerConfig.universes[domain][0];
      $(id).max = controllerConfig.universes[domain][1];
    }
    renderController();
    $("controller-loading").hidden = true;
    $("controller-content").hidden = false;
  } catch (error) {
    console.error("Controller:", error);
    $("controller-loading").hidden = true;
    $("controller-error").hidden = false;
  }
}
for (const id of [
  "error-input",
  "outdoor-input",
  "override-input",
  "override-enabled",
])
  $(id).addEventListener("input", renderController);
document.querySelectorAll("[data-preset]").forEach((button) =>
  button.addEventListener("click", () => {
    const [error, outdoor] = { cold: [6, 0], hot: [-5, 34], near: [0, 15] }[
      button.dataset.preset
    ];
    $("error-input").value = error;
    $("outdoor-input").value = outdoor;
    $("override-enabled").checked = false;
    renderController();
  }),
);
$("reset-controller").addEventListener("click", () => {
  $("error-input").value = 0;
  $("outdoor-input").value = 15;
  $("override-input").value = 0;
  $("override-enabled").checked = false;
  renderController();
});
loadLakes();
loadController();

function renderLakeVisuals() {
  if (!lakeData) return;
  drawLocation($("location-map"), lakeData.lakes, currentLake, nepalOutline);
  text(
    "map-selected-name",
    currentLake
      ? `${currentLake.id} | ${currentLake.basin} basin`
      : "No lake selected",
  );
  const id = $("model-select").value;
  const model = lakeData.lakes[0].forecast.models.find(
    (item) => item.id === id,
  );
  if (!model) return;
  $("diagnostic-model-select").value = id;
  text("scatter-model-name", model.name);
  const points = regressionPoints(lakeData.lakes, id);
  drawScatter(
    $("scatter-chart"),
    points,
    currentLake?.id,
    model.name,
    $("scatter-scale").value,
  );
  const largest = Math.max(...points.map((point) => point.predicted));
  text(
    "scatter-outlier-note",
    `Largest predicted increase: ${pct(largest, 1)}. This point is retained on both axis scales.`,
  );
}
function renderReliability() {
  if (!lakeData) return;
  const id = $("classifier-select").value;
  const classifier = lakeData.lakes[0].forecast.classifiers.find(
    (item) => item.id === id,
  );
  if (!classifier) return;
  const bins = calibrationBins(lakeData.lakes, id);
  drawCalibration($("calibration-chart"), bins, classifier.name);
  $("calibration-bins").replaceChildren(
    ...bins.map((bin) => {
      const row = el("tr");
      [
        `${pct(bin.lower, 0)} to ${pct(bin.upper, 0)}`,
        String(bin.count),
        pct(bin.meanProbability),
        pct(bin.observedFrequency),
      ].forEach((value) => row.append(el("td", value)));
      return row;
    }),
  );
}
async function loadOutline() {
  try {
    const response = await fetch("data/nepal.geojson");
    if (!response.ok) throw new Error("Map outline unavailable");
    nepalOutline = await response.json();
  } catch {
    text(
      "map-note",
      "Outline unavailable. Lake coordinates are still shown; forecasts are unaffected.",
    );
  }
  renderLakeVisuals();
}
$("diagnostic-model-select").addEventListener("change", () => {
  $("model-select").value = $("diagnostic-model-select").value;
  if (currentLake) renderLake();
  else renderLakeVisuals();
});
$("scatter-scale").addEventListener("change", renderLakeVisuals);
$("classifier-select").addEventListener("change", renderReliability);
loadOutline();

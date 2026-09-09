import { test, expect } from "@playwright/test";

test("map follows lake selection and scatter preserves every evaluated point", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator("#location-map [data-lake-id]")).toHaveCount(478);
  await expect(page.locator("#location-map .nepal-outline")).toHaveCount(1);
  await page.locator("#lake-select").selectOption({ index: 23 });
  const selected = await page.locator("#lake-select").inputValue();
  await expect(page.locator("#location-map .selected-lake")).toHaveAttribute(
    "data-selected-id",
    selected,
  );
  await expect(page.locator("#scatter-chart [data-point-id]")).toHaveCount(478);
  await page.locator("#model-select").selectOption("persistence-history");
  await expect(page.locator("#scatter-model-name")).toHaveText("Persistence");
  const predicted = await page
    .locator("#scatter-chart [data-point-id]")
    .evaluateAll((nodes) => nodes.map((n) => Number(n.dataset.predicted)));
  expect(predicted.every((value) => value === 0)).toBeTruthy();
  await page.locator("#lake-search").fill("no-matching-lake");
  await expect(page.locator("#location-map .selected-lake")).toHaveCount(0);
  await expect(page.locator("#scatter-chart [data-point-id]")).toHaveCount(478);
});

test("calibration keeps all outcomes and probability endpoints", async ({
  page,
  request,
}) => {
  const data = await (await request.get("data/lakes.json")).json();
  const expanded = data.lakes.filter(
    (lake) => lake.forecast.actualChange > 0,
  ).length;
  await page.goto("./");
  for (const classifier of data.lakes[0].forecast.classifiers) {
    await page.locator("#classifier-select").selectOption(classifier.id);
    const bins = await page
      .locator("#calibration-chart [data-bin-index]")
      .evaluateAll((nodes) =>
        nodes.map((n) => ({
          count: Number(n.dataset.count),
          freq: Number(n.dataset.frequency),
        })),
      );
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(478);
    expect(
      bins.reduce((sum, bin) => sum + bin.freq * bin.count, 0),
    ).toBeCloseTo(expanded, 8);
  }
  await page.setViewportSize({ width: 320, height: 850 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("missing boundary data does not disable lake forecasts", async ({
  page,
}) => {
  await page.route("**/data/nepal.geojson", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("./");
  await expect(page.locator("#history-chart svg")).toBeVisible();
  await expect(page.locator("#map-note")).toContainText("Outline unavailable");
  await expect(page.locator("#location-map [data-lake-id]")).toHaveCount(478);
});

import { test, expect } from "@playwright/test";

test("all five regressors show the selected lake values on the correct scale", async ({
  page,
  request,
}) => {
  const data = await (await request.get("data/lakes.json")).json();
  const lake = data.lakes[42];
  await page.goto("./");
  await page.locator("#lake-select").selectOption(lake.id);
  for (const model of lake.forecast.models) {
    await page.locator("#model-select").selectOption(model.id);
    const percentage = `${model.change > 0 ? "+" : ""}${(model.change * 100).toFixed(1)}%`;
    await expect(page.locator("#forecast-value")).toHaveText(percentage);
    await expect(page.locator("#forecast-model-name")).toHaveText(model.name);
    await expect(page.locator("#history-chart svg")).toHaveAttribute(
      "aria-label",
      new RegExp(model.name),
    );
  }
  await expect(page.locator("#interval-label")).toHaveText(
    "90% prediction interval",
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download this lake’s data" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${lake.id}-2024.json`);
});

test("empty search clears stale predictions and recovers", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#history-chart svg")).toBeVisible();
  await page.getByLabel("Find a lake").fill("no-such-lake-xxxx");
  await expect(page.locator("#no-lakes")).toBeVisible();
  await expect(page.locator("#lake-detail")).toBeHidden();
  await expect(page.locator("#download-lake")).toBeDisabled();
  await expect(page.locator("#probabilities")).toContainText(
    "Select a matching lake",
  );
  await page.getByLabel("Find a lake").fill("");
  await expect(page.locator("#lake-select option")).toHaveCount(478);
  await page.getByLabel("River basin").selectOption({ index: 1 });
  const basin = await page.getByLabel("River basin").inputValue();
  await expect(page.locator("#lake-basin")).toContainText(basin);
  await expect(page.locator("#lake-detail")).toBeVisible();
});

test("lake-data failure is explained while the independent controller works", async ({
  page,
}) => {
  await page.route("**/data/lakes.json", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("./");
  await expect(page.locator("#lake-error")).toBeVisible();
  await expect(page.locator("#lake-loading")).toBeHidden();
  await page.getByRole("tab", { name: "Room controller" }).click();
  await page.getByRole("button", { name: "Cold room", exact: true }).click();
  expect(
    Number(await page.locator("#command-value").getAttribute("data-command")),
  ).toBeGreaterThan(0);
});

test("tabs work by keyboard and expanded content fits a narrow phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("./");
  const first = page.getByRole("tab", { name: "Lake forecasts" });
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Room controller" }),
  ).toBeFocused();
  await expect(page.locator("#panel-controller")).toBeVisible();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: "About & evidence" }),
  ).toBeFocused();
  await page.getByText("Inspect export provenance", { exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

import { test, expect } from "@playwright/test";

test("lake and model selection update the evaluated forecast", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#lake-select option")).not.toHaveCount(0);
  const first = await page.locator("#lake-heading").textContent();
  await page.locator("#lake-select").selectOption({ index: 1 });
  await expect(page.locator("#lake-heading")).not.toHaveText(first);
  await page.locator("#model-select").selectOption("persistence-history");
  await expect(page.locator("#forecast-model-name")).toContainText(
    "Persistence",
  );
  await expect(page.locator("#history-chart svg")).toBeVisible();
  expect(await page.locator("#forecast-value").textContent()).not.toBe("");
  await expect(page.locator("#lake-error")).toBeHidden();
  expect(errors).toEqual([]);
});

test("controller presets and override recompute real outputs independently", async ({
  page,
  context,
}) => {
  await page.goto("./#controller");
  await page.getByRole("button", { name: "Cold room", exact: true }).click();
  const heating = Number(
    await page.locator("#command-value").getAttribute("data-command"),
  );
  expect(heating).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Hot room", exact: true }).click();
  expect(
    Number(await page.locator("#command-value").getAttribute("data-command")),
  ).toBeLessThan(0);
  await page.getByLabel("Enable manual override").check();
  await page.locator("#override-input").fill("35");
  expect(
    Number(await page.locator("#command-value").getAttribute("data-command")),
  ).toBe(35);
  await expect(page.locator("#controller-status")).toContainText(
    "Manual override",
  );
  const other = await context.newPage();
  await other.goto("./#controller");
  await expect(other.getByLabel("Enable manual override")).not.toBeChecked();
  await page
    .getByRole("button", { name: "Reset controls", exact: true })
    .click();
  await expect(page.getByLabel("Enable manual override")).not.toBeChecked();
});

test("mobile layout fits and public resources resolve", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await expect(page.locator("#history-chart svg")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("tab", { name: "Room controller" }).click();
  await expect(page.locator("#command-value")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("tab", { name: "About & evidence" }).click();
  await expect(page.locator("a[data-report]")).toHaveCount(0);
  const response = await request.get("data/lakes.json");
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).lakes).toHaveLength(478);
});

import { test, expect } from "@playwright/test";

test("public site credits authors in order and exposes no report files", async ({
  page,
  request,
}) => {
  await page.goto("./#evidence");
  expect(await (await request.get("./")).text()).not.toMatch(
    /href=["'][^"']*\.pdf/i,
  );
  await expect(page.locator('a[href*=".pdf"], a[data-report]')).toHaveCount(0);
  await expect(page.locator("#research-authors li")).toHaveText([
    "Shishir Kandel",
    "Netra Bahadur Budhathoki Magar",
    "Rijwol Shakya",
  ]);
  await expect(
    page.getByRole("heading", { name: "Read the reports" }),
  ).toHaveCount(0);
  for (const path of [
    "assets/task1-report.pdf",
    "assets/task2-report.pdf",
    "data/reports.json",
    "tools/prepare_public_reports.py",
  ]) {
    expect((await request.get(path)).status()).toBe(404);
  }
});

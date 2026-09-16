import { test, expect } from '@playwright/test';

test('browse labelled lakes without typing, with stable labels and recovery', async ({ page }) => {
  await page.goto('./');
  const select = page.locator('#lake-select');
  await expect(select.locator('option')).toHaveCount(478);
  await expect(select.locator('optgroup')).toHaveCount(4);
  await expect(select.locator('option:checked')).toHaveText('GLO_83.85335_28.69074 (Tilicho Lake)');
  await select.selectOption({index: 0});
  await expect(page.locator('#previous-lake')).toBeDisabled();
  const first = await select.inputValue();
  await page.locator('#next-lake').click();
  await expect(select).not.toHaveValue(first);
  const second = await select.inputValue();
  const label = await select.locator('option:checked').textContent();
  await expect(page.locator('#lake-heading')).toContainText(second);
  await page.locator('#previous-lake').click();
  await expect(select).toHaveValue(first);
  await page.locator('#lake-search').fill(second);
  await expect(select.locator('option')).toHaveCount(1);
  await expect(select.locator('option:checked')).toHaveText(label);
  await expect(page.locator('#previous-lake')).toBeDisabled();
  await expect(page.locator('#next-lake')).toBeDisabled();
  await page.locator('#lake-search').fill('no-such-lake');
  await expect(select).toBeDisabled();
  await page.locator('#lake-examples').getByRole('button', {name: 'Tsho Rolpa Lake', exact: true}).click();
  await expect(select.locator('option')).toHaveCount(478);
  await expect(page.locator('#lake-heading')).toContainText('Tsho Rolpa Lake');
  await expect(page.locator('#lake-search')).toHaveValue('');
  await page.locator('#lake-search').fill('Gosaikunda');
  await expect(select.locator('option')).toHaveCount(1);
  await expect(page.locator('#lake-heading')).toContainText('Gosaikunda');
  await page.setViewportSize({width:320,height:800});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('named identity links and missing-name fallback remain honest', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#lake-heading')).toContainText('Tilicho Lake');
  await expect(page.locator('#lake-name-source')).toHaveAttribute('href', 'https://www.openstreetmap.org/way/26772994');
  await expect(page.locator('#lake-name-coverage')).toContainText('67 of 478');
  await page.locator('#lake-select').selectOption('GLO_80.88324_30.0535');
  await expect(page.locator('#lake-heading')).toContainText('Name not verified - Karnali basin');
  await expect(page.locator('#lake-name-source')).toBeHidden();
  await expect(page.locator('#lake-map-link')).toHaveAttribute('href', /mlat=30.0535&mlon=80.88324/);
  await page.route('**/data/lake-names.json', route => route.abort());
  await page.reload();
  await expect(page.locator('#lake-select option')).toHaveCount(478);
  await expect(page.locator('#lake-name-coverage')).toContainText('could not be loaded');
  await expect(page.locator('#lake-detail')).toBeVisible();
  await expect(page.locator('#lake-name-source')).toBeHidden();
});

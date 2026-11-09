import { expect, test } from '@playwright/test';
import { completeSetup, visibleLatinText, writeCheque } from './helpers';

const SHOTS = process.env.SHOTS_DIR;

test('كتابة شيك في متصفح لغته إنجليزية', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await completeSetup(page);
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');

  await writeCheque(page);
  await expect(page.getByLabel('المبلغ بالجنيه')).toHaveValue('١٤٨٥٠٠');
  await expect(page.getByText('فقط مائة وثمانية وأربعون ألف وخمسمائة جنيه مصري لا غير')).toBeVisible();
  await expect(page.getByLabel('رقم الشيك')).toHaveValue('١٠٠');

  if (SHOTS) await page.screenshot({ path: `${SHOTS}/compose-desktop.png`, fullPage: true });
  expect(await visibleLatinText(page)).toEqual([]);

  // الكسور مرفوضة
  await page.getByLabel('المبلغ بالجنيه').fill('12.5');
  await expect(page.getByText('الشيكات بالجنيه الصحيح، من غير قروش')).toBeVisible();
  await page.getByLabel('المبلغ بالجنيه').fill('148500');

  await page.getByRole('button', { name: 'راجع واطبع' }).click();
  await expect(page.getByRole('img', { name: 'الشيك مكبّر للمراجعة' })).toBeVisible();
  await expect(page.getByText('١٤٨٥٠٠/-')).toBeVisible();
  await expect(page.getByText('الشيك ده من دفتر شركة: شركة النور للتجارة')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/review-desktop.png`, fullPage: true });
  expect(await visibleLatinText(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('المسودة ترجع بعد إعادة فتح الصفحة', async ({ page }) => {
  await completeSetup(page);
  await writeCheque(page, 'مؤسسة الفجر', '2500');
  await expect(page).toHaveURL(/\/cheque\/[0-9a-f-]{36}$/);
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'المستفيد' })).toHaveValue('مؤسسة الفجر');
  await expect(page.getByLabel('المبلغ بالجنيه')).toHaveValue('٢٥٠٠');

  await page.getByRole('link', { name: 'المسودات' }).click();
  await expect(page.getByRole('link', { name: /مؤسسة الفجر/ })).toBeVisible();
  await expect(page.getByText('٢٬٥٠٠ جنيه')).toBeVisible();
});

test('منتقي التاريخ عربي ويشتغل بالكيبورد', async ({ page }) => {
  await completeSetup(page);
  await page.getByRole('button', { name: /التاريخ/ }).click();
  const dialog = page.getByRole('dialog', { name: 'التاريخ' });
  await expect(dialog).toBeVisible();
  expect(await visibleLatinText(page)).toEqual([]);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
});

test.describe('موبايل', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('الترتيب وزر المراجعة الثابت', async ({ page }) => {
    await completeSetup(page);
    await writeCheque(page);
    const button = page.getByRole('button', { name: 'راجع واطبع' }).locator('visible=true');
    await expect(button).toBeInViewport();
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasOverflow).toBe(false);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/compose-mobile.png`, fullPage: true });
  });
});

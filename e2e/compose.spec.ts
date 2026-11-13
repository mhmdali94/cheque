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
  await page.getByLabel('المبلغ بالجنيه').fill('١٤٨٥٠٠،٤٥');
  await expect(page.getByText('فقط مائة وثمانية وأربعون ألف وخمسمائة جنيه مصري وخمسة وأربعون قرش لا غير')).toBeVisible();
  await page.getByLabel('المبلغ بالجنيه').fill('12.345');
  await expect(page.getByText('القروش رقمين بس بعد العلامة')).toBeVisible();
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

test.describe('منع التاريخ الفائت', () => {
  const dayButton = (page: import('@playwright/test').Page, label: string) => page.getByRole('button', { name: label, exact: true });

  test('الأيام الفايتة مقفولة، والنهارده والجاي مسموح', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-10T10:00:00'));
    await completeSetup(page);
    await page.getByRole('button', { name: /التاريخ/ }).click();
    await expect(page.getByRole('button', { name: 'الشهر السابق' })).toBeDisabled();
    await expect(dayButton(page, '٩ نوفمبر')).toHaveAttribute('aria-disabled', 'true');

    // المحاسب ممكن يضغط على يوم مقفول، والمفروض مفيش حاجة تحصل.
    await dayButton(page, '٩ نوفمبر').click({ force: true });
    await expect(page.getByRole('dialog', { name: 'التاريخ' })).toBeVisible();
    await expect(page.getByRole('button', { name: /التاريخ/ })).toContainText('١٠/١١/٢٠٢٦');

    await dayButton(page, '١١ نوفمبر').click();
    await expect(page.getByRole('button', { name: /التاريخ/ })).toContainText('١١/١١/٢٠٢٦');
  });

  test('مسودة تاريخها فات ما تتراجعش ولا تتطبع لحد ما يتعدل', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-10T10:00:00'));
    await completeSetup(page);
    await writeCheque(page, 'مسودة قديمة', '700');
    await expect(page).toHaveURL(/\/cheque\/[0-9a-f-]{36}$/);
    const url = page.url();
    await page.waitForTimeout(500);

    await page.clock.setFixedTime(new Date('2026-11-12T10:00:00'));
    await page.goto(url);
    await expect(page.getByText('تاريخ الشيك ده فات. اختار النهارده أو يوم جاي.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'راجع واطبع' }).locator('visible=true')).toBeDisabled();

    await page.goto(`${url}/review`);
    await expect(page.getByText(/فات، فمش ممكن يتطبع/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'اطبع على الشيك' })).toBeDisabled();

    await page.goto(url);
    await page.getByRole('button', { name: /التاريخ/ }).click();
    await page.getByRole('button', { name: 'النهارده' }).click();
    await expect(page.getByRole('button', { name: 'راجع واطبع' }).locator('visible=true')).toBeEnabled();
  });

  test('فلاتر السجل لسه بتقبل تواريخ قديمة', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-10T10:00:00'));
    await completeSetup(page);
    await page.goto('/history');
    await page.getByRole('button', { name: /من تاريخ/ }).click();
    await expect(page.getByRole('button', { name: 'الشهر السابق' })).toBeEnabled();
    await expect(dayButton(page, '٩ نوفمبر')).not.toHaveAttribute('aria-disabled', 'true');
  });
});

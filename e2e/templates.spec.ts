import { expect, test } from '@playwright/test';
import { completeSetup, visibleLatinText } from './helpers';

const SHOTS = process.env.SHOTS_DIR;

test('محرر القوالب: تحريك حقل وحفظه', async ({ page }) => {
  await completeSetup(page);
  await page.getByRole('link', { name: 'قوالب الشيكات' }).click();
  await page.getByRole('link', { name: /الحالي/ }).first().click();

  const payee = page.getByRole('button', { name: 'المستفيد، حرّكه بالأسهم' });
  await expect(payee).toBeVisible();
  const before = await page.getByRole('textbox', { name: 'من فوق', exact: true }).inputValue();

  await payee.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('textbox', { name: 'من فوق', exact: true })).not.toHaveValue(before);
  await page.waitForTimeout(500);

  if (SHOTS) await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/editor.png`, fullPage: true });
  expect(await visibleLatinText(page)).toEqual([]);

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'من فوق', exact: true })).not.toHaveValue(before);
  await expect(page.getByText(/تقريبي: اضبطه/)).toHaveCount(0);
});

test('معالج القياس يحفظ المقاس', async ({ page }) => {
  await completeSetup(page);
  await page.getByRole('link', { name: 'قِس شيكك' }).click();
  await expect(page.getByRole('img', { name: 'المسطرة بطول الشيك' })).toBeVisible();
  await page.getByLabel('طول الشيك بالمليمتر').fill('176');
  await page.getByRole('button', { name: 'التالي' }).click();
  await page.getByLabel('عرض الشيك بالمليمتر').fill('85');
  await page.getByRole('button', { name: 'التالي' }).click();
  expect(await visibleLatinText(page)).toEqual([]);
  await page.getByRole('button', { name: 'حفظ المقاس' }).click();
  await expect(page.getByRole('group', { name: 'لوحة ضبط أماكن الحقول' })).toHaveAttribute('viewBox', '-7 -7 183 92');
});

test('إضافة بنك جديد تفتح معالج القياس', async ({ page }) => {
  await completeSetup(page);
  await page.getByRole('link', { name: 'قوالب الشيكات' }).click();
  await page.getByLabel('بنك جديد أو موجود').fill('بنك مصر');
  await page.getByLabel('اسم النموذج').fill('عادي');
  await page.getByRole('button', { name: 'إضافة قالب' }).click();
  await expect(page.getByRole('heading', { name: 'قياس الشيك' })).toBeVisible();
  await expect(page.getByText('بنك مصر: عادي')).toBeVisible();
});

test('تصدير القالب ثم استيراده', async ({ page }) => {
  await completeSetup(page);
  await page.getByRole('link', { name: 'قوالب الشيكات' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'تصدير' }).first().click()]);
  const path = await download.path();
  await page.getByLabel('ملف القالب').setInputFiles({ name: 'template.json', mimeType: 'application/json', buffer: (await import('node:fs')).readFileSync(path) });
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('group', { name: 'لوحة ضبط أماكن الحقول' })).toBeVisible();

  await page.getByRole('link', { name: 'قوالب الشيكات' }).click();
  await page.getByLabel('ملف القالب').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"kind":"x"}') });
  await expect(page.getByText('الملف ده مش قالب شيكاتي صالح')).toBeVisible();
});

test('بنك الإسكندرية الشخصي بنك مستقل في القوائم', async ({ page }) => {
  await completeSetup(page);
  await page.getByRole('link', { name: 'إضافة حساب', exact: true }).click();
  await page.locator('label', { hasText: 'بنك الإسكندرية (شخصي)' }).click();
  await expect(page.getByLabel('نموذج الشيك').locator('option')).toHaveText(['نموذج ١']);
});

test('المحرر: التنقل بين البنوك وزر الحفظ', async ({ page }) => {
  await completeSetup(page);
  await page.goto('/templates/tpl-ahly-qr');
  const bank = page.getByLabel('البنك', { exact: true });
  await expect(bank.locator('option')).toHaveText(['البنك الأهلي المصري', 'بنك الإسكندرية', 'بنك الإسكندرية (شخصي)']);
  await expect(page.getByRole('button', { name: 'محفوظ' })).toBeDisabled();

  await bank.selectOption('بنك الإسكندرية');
  await expect(page).toHaveURL(/\/templates\/tpl-alex-1$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('بنك الإسكندرية');
  expect(await visibleLatinText(page)).toEqual([]);

  const top = page.getByRole('textbox', { name: 'من فوق', exact: true });
  const before = await top.inputValue();
  await page.getByRole('button', { name: 'المستفيد، حرّكه بالأسهم' }).focus();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect(page.getByRole('button', { name: 'محفوظ' })).toBeDisabled();

  await bank.selectOption('البنك الأهلي المصري');
  await expect(page).toHaveURL(/\/templates\/tpl-ahly-qr$/);
  await page.getByLabel('البنك', { exact: true }).selectOption('بنك الإسكندرية');
  await expect(top).not.toHaveValue(before);
});

test('المحرر يحذّر لما القالب منسوخ', async ({ page }) => {
  await completeSetup(page);
  await page.goto('/templates');
  await page.getByRole('button', { name: 'نسخة' }).first().click();
  await expect(page.getByText(/ده قالب منسوخ/)).toBeVisible();
});

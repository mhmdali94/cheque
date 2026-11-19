import { expect, test } from '@playwright/test';
import { completeSetup, visibleLatinText, writeCheque } from './helpers';

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
  await expect(page.getByRole('button', { name: 'محفوظ' })).toBeVisible();

  await bank.selectOption('بنك الإسكندرية');
  await expect(page).toHaveURL(/\/templates\/tpl-alex-1$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('بنك الإسكندرية');
  expect(await visibleLatinText(page)).toEqual([]);

  const top = page.getByRole('textbox', { name: 'من فوق', exact: true });
  const before = await top.inputValue();
  await page.getByRole('button', { name: 'المستفيد، حرّكه بالأسهم' }).focus();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect(page.getByRole('button', { name: 'محفوظ' })).toBeVisible();

  await bank.selectOption('البنك الأهلي المصري');
  await expect(page).toHaveURL(/\/templates\/tpl-ahly-qr$/);
  await page.getByLabel('البنك', { exact: true }).selectOption('بنك الإسكندرية');
  await expect(top).not.toHaveValue(before);
});

test('المحرر يحذّر لما القالب منسوخ', async ({ page }) => {
  await completeSetup(page);
  await page.goto('/templates');
  await page.getByRole('button', { name: 'نسخة' }).first().click();
  await expect(page.getByText(/ده قالب محفوظ باسمك/)).toBeVisible();
});

test('حفظ قالب جديد واختياره للشيك وللحساب', async ({ page }) => {
  await completeSetup(page);
  await writeCheque(page, 'تجربة القالب', '500');
  await expect(page).toHaveURL(/\/cheque\/[0-9a-f-]{36}$/);
  const chequeUrl = page.url();
  await page.waitForTimeout(500);
  const inkTops = () => page.evaluate(() => [...document.querySelectorAll('svg[role="img"] path.ink-in')]
    .map((p) => Math.round((p as SVGGraphicsElement).getBBox().y * 10) / 10).sort((a, b) => a - b).join(','));
  const original = await inkTops();

  await page.goto('/templates/tpl-ahly-qr');
  const top = page.getByRole('textbox', { name: 'من فوق', exact: true });
  const originalTop = await top.inputValue();
  await top.fill('١٠');
  await page.getByRole('button', { name: 'حفظ كقالب جديد' }).click();
  await page.getByLabel('اسم القالب الجديد').fill('أهلي المكتب');
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('أهلي المكتب');
  await expect(top).toHaveValue('١٠');

  // القالب الجاهز رجع لأماكنه
  await page.goto('/templates/tpl-ahly-qr');
  await expect(top).toHaveValue(originalTop);

  // الشيك المكتوب يقدر يختار القالب الجديد
  await page.goto(chequeUrl);
  await page.getByLabel('قالب الطباعة', { exact: true }).selectOption({ label: 'أهلي المكتب' });
  await expect.poll(inkTops).not.toBe(original);
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByLabel('قالب الطباعة', { exact: true }).locator('option:checked')).toHaveText('أهلي المكتب');

  // الحساب يقدر يخليه الافتراضي للشيكات الجديدة
  await page.goto('/accounts');
  await page.getByLabel('قالب الطباعة للشيكات الجديدة').selectOption({ label: 'أهلي المكتب' });
  await page.goto('/cheque');
  await page.getByRole('link', { name: 'المسودات' }).click();
  await page.goto('/cheque');
  await page.getByRole('combobox', { name: 'المستفيد' }).fill('شيك جديد');
  await expect(page.getByLabel('قالب الطباعة', { exact: true }).locator('option:checked')).toHaveText('أهلي المكتب');

  // زر الحفظ دايماً بيأكد
  await page.goto('/templates/tpl-ahly-qr');
  await page.getByRole('button', { name: 'محفوظ' }).click();
  await expect(page.getByText('اتحفظت التعديلات.', { exact: false })).toBeVisible();
});

test('مسح قالب محفوظ، والحساب اللي عليه بيرجع للقالب الجاهز', async ({ page }) => {
  await completeSetup(page);
  await page.goto('/templates');
  await expect(page.getByRole('button', { name: 'حذف' }).first()).toBeVisible();
  const builtinCount = await page.getByRole('button', { name: 'حذف' }).count();

  await page.goto('/templates/tpl-ahly-qr');
  await page.getByRole('button', { name: 'حفظ كقالب جديد' }).click();
  await page.getByLabel('اسم القالب الجديد').fill('قالب للمسح');
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('قالب للمسح');

  await page.goto('/accounts');
  await page.getByLabel('قالب الطباعة للشيكات الجديدة').selectOption({ label: 'قالب للمسح' });

  await page.goto('/templates');
  const row = page.getByRole('listitem').filter({ hasText: 'قالب للمسح' });
  await row.getByRole('button', { name: 'حذف' }).click();
  await expect(page.getByText(/١ حساب و٠ مسودة عليه/)).toBeVisible();
  await page.getByRole('button', { name: 'إلغاء' }).click();
  await expect(page.getByRole('link', { name: /قالب للمسح/ })).toBeVisible();

  await row.getByRole('button', { name: 'حذف' }).click();
  await page.getByRole('button', { name: 'امسح القالب' }).click();
  expect(builtinCount).toBeGreaterThan(0);
  await expect(page.getByRole('link', { name: /قالب للمسح/ })).toHaveCount(0);

  await page.goto('/accounts');
  await expect(page.getByLabel('قالب الطباعة للشيكات الجديدة').locator('option:checked')).toHaveText('الحالي (برمز مربع)');
  await page.goto('/cheque');
  await expect(page.getByRole('img', { name: 'معاينة الشيك' })).toBeVisible();
});

test('مسح قالب جاهز بيفضل ممسوح، وبيرجع بالاسترجاع', async ({ page }) => {
  await completeSetup(page);
  await page.goto('/templates');
  const old = page.getByRole('listitem').filter({ hasText: /^قديم/ });
  await expect(old).toHaveCount(1);
  await old.getByRole('button', { name: 'حذف' }).click();
  await expect(page.getByText(/ده قالب جاهز/)).toBeVisible();
  await page.getByRole('button', { name: 'امسح القالب' }).click();
  await expect(page.getByRole('link', { name: /^قديم/ })).toHaveCount(0);

  // التطبيق ما يرجّعهوش لوحده بعد إعادة الفتح
  await page.reload();
  await expect(page.getByRole('link', { name: /^قديم/ })).toHaveCount(0);

  // القالب المستخدم في الحساب بيتمسح والحساب بينتقل لقالب تاني للبنك
  const current = page.getByRole('listitem').filter({ hasText: /^الحالي \(برمز مربع\)/ });
  await current.getByRole('button', { name: 'حذف' }).click();
  await page.getByRole('button', { name: 'امسح القالب' }).click();
  await expect(page.getByRole('link', { name: /^الحالي \(برمز مربع\)/ })).toHaveCount(0);
  await page.goto('/accounts');
  await expect(page.getByLabel('قالب الطباعة للشيكات الجديدة').locator('option:checked')).not.toHaveText('الحالي (برمز مربع)');

  await page.goto('/templates');
  await page.getByRole('button', { name: /استرجاع القوالب الجاهزة/ }).click();
  await expect(page.getByRole('link', { name: /^قديم/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^الحالي \(برمز مربع\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /استرجاع القوالب الجاهزة/ })).toHaveCount(0);
});

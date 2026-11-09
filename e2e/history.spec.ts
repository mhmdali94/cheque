import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { completeSetup, visibleLatinText, writeCheque } from './helpers';

const SHOTS = process.env.SHOTS_DIR;

async function draft(page: Page, payee: string, amount: string) {
  await page.goto('/cheque');
  await writeCheque(page, payee, amount);
  await page.waitForTimeout(450);
}

test('السجل: بحث وفلترة وشيك مشابه وسجل المراجعة', async ({ page }) => {
  await completeSetup(page);
  await draft(page, 'مؤسسة الفجر', '2500');
  await page.getByRole('link', { name: 'السجل', exact: true }).click();
  await expect(page.getByRole('link', { name: /مؤسسة الفجر/ })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/history.png`, fullPage: true });
  expect(await visibleLatinText(page)).toEqual([]);

  await page.getByLabel('بحث').fill('٢٥٠٠');
  await expect(page.getByRole('link', { name: /مؤسسة الفجر/ })).toBeVisible();
  await page.getByLabel('بحث').fill('999');
  await expect(page.getByText('مفيش شيكات مطابقة')).toBeVisible();
  await page.getByLabel('بحث').fill('');

  await page.getByRole('button', { name: 'السجل', exact: true }).click();
  await expect(page.getByText(/إنشاء ، سارة أحمد/)).toBeVisible();

  await page.getByRole('button', { name: 'شيك مشابه' }).click();
  await expect(page.getByLabel('رقم الشيك')).toHaveValue('١٠١');
  await expect(page.getByRole('combobox', { name: 'المستفيد' })).toHaveValue('مؤسسة الفجر');
});

test('تصدير Excel يتنزل', async ({ page }) => {
  await completeSetup(page);
  await draft(page, 'مؤسسة الفجر', '2500');
  await page.goto('/history');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'تصدير إكسل' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
});

test('نسخة مشفرة ثم استيراد في متصفح نظيف', async ({ page, browser }) => {
  await completeSetup(page);
  await draft(page, 'مؤسسة الفجر', '2500');
  await page.goto('/backup');
  await page.getByLabel('كلمة سر للتشفير').fill('سر123');
  await page.getByLabel('أعد كتابة كلمة السر').fill('سر123');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'اعمل نسخة' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.shikaty$/);
  const bytes = readFileSync(await download.path());
  expect(bytes.toString()).not.toContain('مؤسسة الفجر');

  const clean = await browser.newContext({ locale: 'en-US', baseURL: 'http://localhost:4173' });
  const other = await clean.newPage();
  await completeSetup(other);
  await other.goto('/backup');
  await other.getByLabel('ملف النسخة الاحتياطية').setInputFiles({ name: 'b.shikaty', mimeType: 'application/json', buffer: bytes });
  await other.getByLabel('كلمة سر الملف').fill('غلط');
  await other.getByRole('button', { name: 'افتح الملف' }).click();
  await expect(other.getByText('كلمة السر غلط')).toBeVisible();
  await other.getByLabel('كلمة سر الملف').fill('سر123');
  await other.getByRole('button', { name: 'افتح الملف' }).click();
  await expect(other.getByText(/هيتضاف ١ شيك/)).toBeVisible();
  await other.getByRole('button', { name: 'ادمج مع بياناتي' }).click();
  await expect(other.getByText(/تم الدمج/)).toBeVisible();

  await other.goto('/history');
  await other.getByLabel('كل الشركات').check();
  await expect(other.getByRole('link', { name: /مؤسسة الفجر/ })).toBeVisible();
  await clean.close();
});

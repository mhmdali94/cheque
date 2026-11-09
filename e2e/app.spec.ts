import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';
import { completeSetup, visibleLatinText, writeCheque } from './helpers';

const SHOTS = process.env.SHOTS_DIR;

async function batchFile(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('الشيكات');
  sheet.addRow(['المستفيد', 'المبلغ', 'التاريخ', 'البيان']);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test('طباعة دفعة: إيقاف بين كل شيك، والتالف يزحزح الأرقام', async ({ page }) => {
  await completeSetup(page);
  await page.getByRole('link', { name: 'دفعة من إكسل' }).click();
  await expect(page.getByRole('heading', { name: 'طباعة دفعة من إكسل' })).toBeVisible();
  expect(await visibleLatinText(page)).toEqual([]);

  await page.getByLabel('ملف إكسل').setInputFiles({
    name: 'b.xlsx', mimeType: 'application/octet-stream',
    buffer: await batchFile([['شركة أ', 1000, '14/03/2026', ''], ['شركة ب', '٢٠٠٠', '', ''], ['', 5, '', '']]),
  });
  await expect(page.getByText(/المستفيد ناقص.*مش هيتطبع/)).toBeVisible();
  await page.getByLabel(/أتحمل المسؤولية/).check();
  await page.evaluate(() => { window.open = (() => window) as typeof window.open; });
  await page.getByRole('button', { name: /ابدأ طباعة ٢ شيك/ }).click();

  await expect(page.getByText('أدخل الشيك التالي رقم ١٠٠ ثم اضغط متابعة.')).toBeVisible();
  await page.getByRole('button', { name: 'متابعة' }).click();
  await page.getByRole('button', { name: 'تالف، هات الرقم التالي' }).click();

  await expect(page.getByText('أدخل الشيك التالي رقم ١٠١ ثم اضغط متابعة.')).toBeVisible();
  await expect(page.getByText('شركة أ')).toBeVisible();
  await page.getByRole('button', { name: 'متابعة' }).click();
  await page.getByRole('button', { name: 'تمام، طلع سليم' }).click();

  await expect(page.getByText('أدخل الشيك التالي رقم ١٠٢ ثم اضغط متابعة.')).toBeVisible();
  await page.getByRole('button', { name: 'متابعة' }).click();
  await page.getByRole('button', { name: 'تمام، طلع سليم' }).click();
  await expect(page.getByText('خلصت الدفعة.')).toBeVisible();
});

test('الوضع الداكن والإعدادات واللوحة', async ({ page }) => {
  await completeSetup(page);
  await writeCheque(page);
  await page.waitForTimeout(500);
  await page.getByRole('link', { name: 'الإعدادات' }).click();
  await page.getByLabel('المظهر').selectOption('dark');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  expect(await visibleLatinText(page)).toEqual([]);

  await page.goto('/cheque');
  await writeCheque(page);
  await page.waitForTimeout(500);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/dark.png`, fullPage: true });

  await page.getByRole('link', { name: 'الرئيسية' }).click();
  await expect(page.getByRole('heading', { name: 'شيكات مؤجلة جاية' })).toBeVisible();
  expect(await visibleLatinText(page)).toEqual([]);
});

test('العمل بدون إنترنت بعد أول فتح', async ({ page, context }) => {
  await completeSetup(page);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (registration.active?.state !== 'activated') {
      await new Promise((resolve) => registration.active?.addEventListener('statechange', resolve));
    }
  });
  await page.reload();
  await expect(page.getByRole('img', { name: 'معاينة الشيك' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await writeCheque(page, 'بدون إنترنت', '750');
  await expect(page.getByText('فقط سبعمائة وخمسون جنيه مصري لا غير')).toBeVisible();
  await page.goto('/drafts');
  await expect(page.getByRole('heading', { name: 'المسودات' })).toBeVisible();
  await context.setOffline(false);
});

test('اختصار البحث والمسار غير الموجود', async ({ page }) => {
  await completeSetup(page);
  await page.goto('/history');
  await page.locator('h1').click();
  await page.keyboard.press('/');
  await expect(page.getByLabel('بحث')).toBeFocused();
  await page.goto('/مسار-غير-موجود');
  await expect(page.getByRole('img', { name: 'معاينة الشيك' })).toBeVisible();
});

test.describe('بدون ملفات مخزنة', () => {
  // خادم الخدمة بيجيب الملف من مخزنه، فالحجب هنا كان بيعتمد على مين يسبق.
  test.use({ serviceWorkers: 'block' });

  test('فشل ملف التشكيل ما يوقعش التطبيق', async ({ page }) => {
    await page.route('**/*.wasm', (route) => route.fulfill({ status: 404, body: '' }));
    await completeSetup(page);
    await expect(page.getByText('تعذر تحميل خط الشيك. أعد فتح الصفحة.')).toBeVisible();
  });
});

test('مخزن البيانات المحجوب يعرض رسالة بدل صفحة بيضا', async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => { throw new DOMException('denied', 'SecurityError'); };
  });
  await page.goto('/');
  await expect(page.getByText(/تعذر فتح مخزن البيانات/)).toBeVisible();
});

test('زر تحديث التطبيق يعيد التحميل ويحافظ على البيانات', async ({ page, context }) => {
  await completeSetup(page);
  await writeCheque(page, 'يفضل بعد التحديث', '900');
  await page.waitForTimeout(500);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto('/settings');
  await expect(page.getByText(/الإصدار الحالي/)).toBeVisible();
  expect(await visibleLatinText(page)).toEqual([]);

  // من غير إنترنت: رسالة، والملفات المؤقتة تفضل زي ما هي
  await context.setOffline(true);
  await page.getByRole('button', { name: 'تحديث التطبيق' }).click();
  await expect(page.getByText(/مفيش اتصال بالموقع/)).toBeVisible();
  expect(await page.evaluate(async () => (await caches.keys()).length)).toBeGreaterThan(0);
  await context.setOffline(false);

  await page.evaluate(() => { (window as unknown as { __stale: boolean }).__stale = true; });
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'تحديث التطبيق' }).click()]);
  await expect(page.getByRole('heading', { name: 'الإعدادات' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __stale?: boolean }).__stale)).toBeUndefined();

  await page.goto('/drafts');
  await expect(page.getByRole('link', { name: /يفضل بعد التحديث/ })).toBeVisible();
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(1);
});

test('وصول إصدار جديد يعيد تحميل الصفحة مرة واحدة', async ({ page }) => {
  await completeSetup(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.reload();
  await expect(page.getByRole('img', { name: 'معاينة الشيك' })).toBeVisible();
  await page.evaluate(() => { (window as unknown as { __stale: boolean }).__stale = true; });
  await Promise.all([
    page.waitForEvent('load'),
    page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange'))),
  ]);
  await expect(page.getByRole('img', { name: 'معاينة الشيك' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __stale?: boolean }).__stale)).toBeUndefined();
});

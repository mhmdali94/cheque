import { expect, test } from '@playwright/test';
import { completeSetup, visibleLatinText, writeCheque } from './helpers';

const SHOTS = process.env.SHOTS_DIR;

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
  await expect(page.getByRole('heading', { name: /أهلاً/ })).toBeVisible();
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

const NAV_ORDER = ['الرئيسية', 'الشركات', 'الحسابات البنكية', 'إضافة حساب', 'كتابة شيك'];

test('القائمة ثابتة فوق وبالترتيب المطلوب', async ({ page }) => {
  await completeSetup(page);
  const nav = page.getByRole('navigation', { name: 'القائمة الرئيسية' });
  await expect(nav.getByRole('link')).toHaveText([...NAV_ORDER, 'المسودات', 'السجل', 'قوالب الشيكات', 'الطابعة والمعايرة', 'النسخ الاحتياطي', 'الإعدادات']);
  const links = await nav.getByRole('link').evaluateAll((items) => items.map((item) => item.getBoundingClientRect()));
  const gapRight = await page.evaluate(() => document.documentElement.clientWidth) - Math.max(...links.map((r) => r.right));
  const gapLeft = Math.min(...links.map((r) => r.left));
  expect(Math.abs(gapRight - gapLeft)).toBeLessThan(2);

  await page.goto('/printer');
  await expect(page.getByRole('heading', { name: 'طابعة تانية' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 1500));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  const box = await nav.boundingBox();
  expect(box!.y).toBeLessThan(80);
});

test('الرئيسية فيها الملخص والخطوات والمساعدة', async ({ page }) => {
  await completeSetup(page);
  await writeCheque(page, 'مؤسسة الفجر', '2500');
  await page.waitForTimeout(500);
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('region', { name: 'ملخص الأسبوع' })).toBeVisible();
  const banner = page.getByRole('img', { name: /شيكاتك مكتوبة صح/ });
  await expect(banner).toBeVisible();
  expect(await banner.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: /ابدأ من هنا/ })).toBeVisible();
  await page.getByText('إزاي أكتب شيك؟').click();
  await expect(page.getByText('التفقيط بيتكتب لوحده، والشيك بيتحفظ', { exact: false })).toBeVisible();
  expect(await visibleLatinText(page)).toEqual([]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/home.png`, fullPage: true });
});

test('إضافة حساب بدفتر يظهر في صفحة الحسابات', async ({ page }) => {
  await completeSetup(page);
  await page.getByRole('link', { name: 'إضافة حساب', exact: true }).click();
  await expect(page.getByRole('radio')).toHaveCount(3);
  await page.locator('label', { hasText: /^بنك الإسكندرية$/ }).click();
  await page.getByLabel('اسم مميز للحساب').fill('حساب المرتبات');
  await page.getByLabel('أول رقم').fill('500');
  await page.getByLabel('آخر رقم').fill('524');
  expect(await visibleLatinText(page)).toEqual([]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/add-account.png`, fullPage: true });
  await page.getByRole('button', { name: 'حفظ الحساب' }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.getByRole('heading', { name: 'بنك الإسكندرية', exact: true })).toBeVisible();
  await expect(page.getByText('حساب المرتبات')).toBeVisible();
  await expect(page.getByText(/من ٥٠٠ إلى ٥٢٤/)).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/accounts.png`, fullPage: true });
});

test.describe('القائمة على الموبايل', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('الصفحة ما بتتحركش بالعرض', async ({ page }) => {
    await completeSetup(page);
    for (const path of ['/dashboard', '/accounts', '/accounts/new', '/cheque']) {
      await page.goto(path);
      await page.waitForTimeout(200);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    }
    await page.goto('/dashboard');
    await page.waitForTimeout(300);
    // على الشاشة الضيقة القائمة بتتحرك بالعرض، وأول عنصر لازم يفضل ظاهر.
    await expect(page.getByRole('link', { name: 'الرئيسية' })).toBeInViewport();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/home-mobile.png`, fullPage: true });
  });
});

test('مسح كل البيانات بيرجع الجهاز زي أول مرة بعد التأكيد', async ({ page }) => {
  await completeSetup(page);
  await writeCheque(page, 'شيك هيتمسح', '500');
  await page.waitForTimeout(500);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'مسح كل البيانات' }).click();
  await expect(page.getByText(/هيتمسح نهائياً من الجهاز ده: ١ شيك/)).toBeVisible();
  expect(await visibleLatinText(page)).toEqual([]);

  const confirm = page.getByRole('button', { name: 'امسح كل حاجة نهائياً' });
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/للتأكيد/).fill('كلمة غلط');
  await expect(confirm).toBeDisabled();

  await page.getByRole('button', { name: 'إلغاء' }).click();
  await page.goto('/drafts');
  await expect(page.getByRole('link', { name: /شيك هيتمسح/ })).toBeVisible();

  await page.goto('/settings');
  await page.getByRole('button', { name: 'مسح كل البيانات' }).click();
  await page.getByLabel(/للتأكيد/).fill('امسح');
  await page.getByRole('button', { name: 'امسح كل حاجة نهائياً' }).click();
  await expect(page.getByLabel('اسم الشركة')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('اسم الشركة')).toBeVisible();
  await completeSetup(page);
  await page.goto('/drafts');
  await expect(page.getByText('مفيش مسودات')).toBeVisible();
});

test('صفحة الشركات: تعديل وإضافة، وبعد الإضافة نكمّل بالحساب', async ({ page }) => {
  await completeSetup(page);
  await page.getByRole('link', { name: 'الشركات', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'الشركات', exact: true })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/companies.png`, fullPage: true });
  expect(await visibleLatinText(page)).toEqual([]);

  await page.getByRole('button', { name: 'تعديل' }).click();
  const name = page.getByLabel('اسم الشركة');
  await expect(name).toHaveValue('شركة النور للتجارة');
  await name.fill('');
  await page.getByRole('button', { name: 'حفظ التعديل' }).click();
  await expect(page.getByText('اكتب اسم الشركة')).toBeVisible();
  await name.fill('شركة النور الجديدة');
  await page.getByRole('button', { name: 'حفظ التعديل' }).click();
  await expect(page.getByRole('heading', { name: 'شركة النور الجديدة' })).toBeVisible();
  const selector = page.getByRole('combobox', { name: 'الشركة' });
  await expect(selector.locator('option')).toHaveText(['شركة النور الجديدة']);

  await page.getByRole('button', { name: 'شركة جديدة' }).click();
  await page.getByLabel('اسم الشركة').fill('شركة ثانية');
  await page.getByRole('button', { name: 'حفظ الشركة' }).click();
  await expect(page).toHaveURL(/\/accounts\/new$/);
  await expect(page.getByText(/حساب جديد لشركة شركة ثانية/)).toBeVisible();
  await expect(selector.locator('option')).toHaveCount(2);

  await page.getByRole('link', { name: 'الشركات', exact: true }).click();
  await page.getByRole('button', { name: 'افتح حسابات شركة النور الجديدة' }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.getByRole('heading', { name: 'شركة النور الجديدة' })).toBeVisible();
});

test('أول فتح بيعرض البانر فوق نموذج البداية', async ({ page }) => {
  await page.goto('/');
  const banner = page.getByRole('img', { name: /شيكاتك مكتوبة صح/ });
  await expect(banner).toBeVisible();
  await expect.poll(() => banner.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByLabel('اسم الشركة')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/setup.png` });
});

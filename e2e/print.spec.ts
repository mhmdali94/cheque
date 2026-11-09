import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { completeSetup, visibleLatinText, writeCheque } from './helpers';

const SHOTS = process.env.SHOTS_DIR;
const PDFJS_DIR = resolve(process.cwd(), 'node_modules/pdfjs-dist/build');
const PT_TO_MM = 25.4 / 72;

interface Ink { minX: number; maxX: number; minY: number; maxY: number; darkShare: number; }

async function servePdfjs(page: Page) {
  await page.route('**/__pdfjs/*', (route) => {
    const file = route.request().url().split('/__pdfjs/')[1];
    return route.fulfill({ body: readFileSync(resolve(PDFJS_DIR, file)), contentType: 'text/javascript' });
  });
}

/** يرسم الصفحة ويرجع حدود الحبر بالمليمتر. */
function inkBounds(page: Page, bytes: Buffer, region?: { top: number; bottom: number }): Promise<Ink> {
  return page.evaluate(async ({ base64, region }) => {
    const pdfjs = await import(/* @vite-ignore */ '/__pdfjs/pdf.min.mjs' as string);
    pdfjs.GlobalWorkerOptions.workerSrc = '/__pdfjs/pdf.worker.min.mjs';
    const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const doc = await pdfjs.getDocument({ data }).promise;
    const pdfPage = await doc.getPage(1);
    const scale = 4;
    const viewport = pdfPage.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    await pdfPage.render({ canvasContext: context, canvas, viewport }).promise;
    const { data: pixels, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    const mm = 25.4 / 72 / scale;
    const first = region ? Math.floor(region.top / mm) : 0;
    const last = region ? Math.ceil(region.bottom / mm) : height;
    let [minX, maxX, minY, maxY, dark, total] = [Infinity, -1, Infinity, -1, 0, 0];
    for (let y = first; y < Math.min(last, height); y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        total++;
        if (pixels[i] < 200 && pixels[i + 3] > 100) {
          dark++;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
    }
    return { minX: minX * mm, maxX: maxX * mm, minY: minY * mm, maxY: maxY * mm, darkShare: dark / total };
  }, { base64: bytes.toString('base64'), region });
}

/** يشغّل زر الطباعة ويرجع بايتات الملف اللي اتفتح. */
async function captureOpenedPdf(page: Page, click: () => Promise<void>): Promise<Buffer> {
  await page.evaluate(() => {
    const w = window as unknown as { __opened: Promise<string>; open: typeof window.open };
    w.__opened = new Promise((resolve) => {
      w.open = ((url: string) => { resolve(url); return window; }) as typeof window.open;
    });
  });
  await click();
  const base64 = await page.evaluate(async () => {
    const url = await (window as unknown as { __opened: Promise<string> }).__opened;
    const buffer = await (await fetch(url)).arrayBuffer();
    let binary = '';
    new Uint8Array(buffer).forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary);
  });
  return Buffer.from(base64, 'base64');
}

async function tickChecklist(page: Page) {
  for (const label of ['الشيك في الدرج', 'داخل بالطول', 'الوش اللي هيتطبع', 'رقم الشيك على الورقة', 'أتحمل المسؤولية']) {
    await page.getByLabel(new RegExp(label)).check();
  }
}

test('شيك كامل: PDF على A4 مُدار وبدون خلفية', async ({ page }) => {
  await servePdfjs(page);
  await completeSetup(page);
  await writeCheque(page);
  await page.getByRole('button', { name: 'راجع واطبع' }).click();
  const printButton = page.getByRole('button', { name: 'اطبع على الشيك' });
  await expect(printButton).toBeDisabled();
  await tickChecklist(page);
  await expect(printButton).toBeEnabled();

  const bytes = await captureOpenedPdf(page, () => printButton.click());
  const doc = await PDFDocument.load(bytes);
  const { width, height } = doc.getPage(0).getSize();
  expect(Math.abs(width * PT_TO_MM - 210)).toBeLessThan(0.1);
  expect(Math.abs(height * PT_TO_MM - 297)).toBeLessThan(0.1);
  const images = doc.getPage(0).node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
  expect(images?.entries().length ?? 0).toBe(0);

  const ink = await inkBounds(page, bytes);
  // كل الحبر داخل شريط الشيك المتوسط، وبعد هامش الحافة الأولى
  expect(ink.minX).toBeGreaterThanOrEqual(63);
  expect(ink.maxX).toBeLessThanOrEqual(147);
  expect(ink.minY).toBeGreaterThan(5);
  expect(ink.maxY).toBeLessThanOrEqual(174);
  // الكلام مُدار: امتداده بطول الصفحة أكبر من عرضها
  expect(ink.maxY - ink.minY).toBeGreaterThan(ink.maxX - ink.minX);

  await expect(page.getByRole('heading', { name: 'هل طُبع الشيك سليم؟' })).toBeVisible();
  await page.getByRole('button', { name: 'تمام، طلع سليم' }).click();
  await expect(page.getByText('اتحفظ الشيك كمطبوع.')).toBeVisible();
});

/** صورة شيك غامقة بالكامل، عشان أي جزء منها يفضل في منطقة الترميز يبان فوراً. */
async function attachDarkPhoto(page: Page) {
  await page.goto('/templates/tpl-ahly-qr');
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 400;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#111';
    context.fillRect(0, 0, 800, 400);
    return canvas.toDataURL('image/png');
  });
  await page.getByText('صوّر الشيك الفارغ أو ارفع صورته').locator('input').setInputFiles({
    name: 'cheque.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64'),
  });
  await page.getByRole('button', { name: 'احفظ الصورة' }).click();
  await expect(page.getByRole('button', { name: 'احفظ الصورة' })).toBeHidden();
  await page.waitForTimeout(500);
  await page.goto('/cheque');
}

// الشيك يبدأ بعد هامش ٨ مم، وخط الترميز عند ٦٨٫٠٤ مم من أعلاه.
const MICR_TOP = 8 + 68.04;
const CHEQUE_BOTTOM = 8 + 84;

test('نسخة المراجعة: علامة مائية ومن غير شريط الترميز', async ({ page }) => {
  await servePdfjs(page);
  await completeSetup(page);
  await attachDarkPhoto(page);
  await writeCheque(page);
  await page.getByRole('button', { name: 'راجع واطبع' }).click();
  const bytes = await captureOpenedPdf(page, () => page.getByRole('button', { name: 'طباعة للمراجعة على ورق عادي' }).click());
  if (SHOTS) (await import('node:fs')).writeFileSync(`${SHOTS}/review.pdf`, bytes);

  const above = await inkBounds(page, bytes, { top: 8, bottom: MICR_TOP });
  expect(above.darkShare).toBeGreaterThan(0.3);
  // تحت الخط مفيش غير سطور اسم المحاسب والتوقيع، والصورة ممسوحة فعلياً
  const band = await inkBounds(page, bytes, { top: MICR_TOP + 1, bottom: CHEQUE_BOTTOM });
  expect(band.darkShare).toBeLessThan(0.05);
});

test('مقارنة الراسمين: نفس المكان، والمسارات أصغر وبدون صور', async ({ page }) => {
  await servePdfjs(page);
  await completeSetup(page);
  await page.getByRole('link', { name: 'الطابعة والمعايرة' }).click();

  const trial = async () => captureOpenedPdf(page, () => page.getByRole('button', { name: 'اطبع تجربة' }).click());
  const vector = await trial();
  await page.getByLabel('طريقة رسم الكلام').selectOption('canvas');
  await page.waitForTimeout(300);
  const canvas = await trial();

  const imageCount = async (bytes: Buffer) => {
    const doc = await PDFDocument.load(bytes);
    return doc.getPage(0).node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict)?.entries().length ?? 0;
  };
  expect(await imageCount(vector)).toBe(0);
  expect(await imageCount(canvas)).toBeGreaterThan(0);
  expect(vector.length).toBeLessThan(canvas.length);
  console.log(`vector ${vector.length} bytes, canvas ${canvas.length} bytes`);
  if (SHOTS) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(`${SHOTS}/trial-vector.pdf`, vector);
    writeFileSync(`${SHOTS}/trial-canvas.pdf`, canvas);
  }

  const [a, b] = [await inkBounds(page, vector), await inkBounds(page, canvas)];
  for (const key of ['minX', 'maxX', 'minY', 'maxY'] as const) expect(Math.abs(a[key] - b[key])).toBeLessThan(1.5);
});

test('التالف يقترح الرقم التالي', async ({ page }) => {
  await completeSetup(page);
  await writeCheque(page);
  await page.getByRole('button', { name: 'راجع واطبع' }).click();
  await tickChecklist(page);
  await page.evaluate(() => { window.open = (() => window) as typeof window.open; });
  await page.getByRole('button', { name: 'اطبع على الشيك' }).click();
  await page.getByRole('button', { name: 'تالف، هات الرقم التالي' }).click();
  await expect(page.getByLabel('رقم الشيك')).toHaveValue('١٠١');
  await expect(page.getByRole('combobox', { name: 'المستفيد' })).toHaveValue('شركة الأمل للمقاولات');
});

test('صفحة الطابعة عربية ما عدا أسماء القوائم، والتشخيص يعدّل الإزاحة', async ({ page }) => {
  await completeSetup(page);
  await page.getByRole('link', { name: 'الطابعة والمعايرة' }).click();
  await expect(page.getByRole('heading', { name: 'الطابعة والمعايرة' })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/printer.png`, fullPage: true });
  expect(await visibleLatinText(page)).toEqual([]);

  await page.getByRole('button', { name: 'نازل لتحت' }).click();
  await expect(page.getByText(/رأسية -٠٫٥ مم|رأسية -٠.٥ مم/)).toBeVisible();

  await page.getByRole('button', { name: 'مقلوب' }).click();
  await expect(page.getByText('عدّلنا الاتجاه.', { exact: false })).toBeVisible();
});

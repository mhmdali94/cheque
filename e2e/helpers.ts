import { expect, type Page } from '@playwright/test';

/** أول إعداد: شركة ودفتر بأرقام لاتينية، عشان نتأكد إنها بتتعرض عربي. */
export async function completeSetup(page: Page, { from = '100', to = '124' } = {}) {
  await page.goto('/');
  await page.getByLabel('اسمك').fill('سارة أحمد');
  await page.getByLabel('اسم الشركة').fill('شركة النور للتجارة');
  await page.getByLabel('أول رقم في الدفتر').fill(from);
  await page.getByLabel('آخر رقم في الدفتر').fill(to);
  await page.getByRole('button', { name: 'ابدأ' }).click();
  await expect(page.getByRole('heading', { name: /أهلاً/ })).toBeVisible();
  await page.goto('/cheque');
  await expect(page.getByRole('img', { name: 'معاينة الشيك' })).toBeVisible();
}

export async function writeCheque(page: Page, payee = 'شركة الأمل للمقاولات', amount = '148500') {
  await page.getByRole('combobox', { name: 'المستفيد' }).fill(payee);
  await page.getByLabel('المبلغ بالجنيه').fill(amount);
}

/** نصوص الواجهة الظاهرة اللي فيها حروف أو أرقام لاتينية. */
export function visibleLatinText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style, [data-allow-latin]') || parent.checkVisibility?.() === false) continue;
      if (/[A-Za-z0-9]/.test(node.data)) found.push(node.data.trim());
    }
    document.querySelectorAll('input, option').forEach((element) => {
      const value = (element as HTMLInputElement).value;
      const type = (element as HTMLInputElement).type;
      if (element.tagName === 'INPUT' && type !== 'checkbox' && type !== 'radio' && /[A-Za-z0-9]/.test(value)) found.push(value);
      if (element.tagName === 'OPTION' && /[A-Za-z0-9]/.test(element.textContent ?? '')) found.push(element.textContent ?? '');
    });
    return found;
  });
}

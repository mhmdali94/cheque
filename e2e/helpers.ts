import { expect, type Page } from '@playwright/test';

/** يجهّز جهاز جديد عن طريق الصفحات العادية: اسم المحاسب، الشركة، وحساب بدفتر. */
export async function completeSetup(page: Page, { from = '100', to = '124' } = {}) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /أهلاً/ })).toBeVisible();

  await page.goto('/settings');
  const accountant = page.getByLabel('اسم المحاسب على الجهاز ده');
  await expect(accountant).toBeVisible();
  await page.waitForTimeout(150);
  await accountant.fill('سارة أحمد');
  await page.waitForTimeout(100);

  await page.goto('/companies');
  await page.getByRole('button', { name: 'تعديل' }).click();
  await page.getByLabel('اسم الشركة').fill('شركة النور للتجارة');
  await page.getByRole('button', { name: 'حفظ التعديل' }).click();
  await expect(page.getByRole('heading', { name: 'شركة النور للتجارة' })).toBeVisible();

  await page.goto('/accounts/new');
  await expect(page.getByRole('radio').first()).toBeAttached();
  await page.getByLabel('أول رقم').fill(from);
  await page.getByLabel('آخر رقم').fill(to);
  await page.getByRole('button', { name: 'حفظ الحساب' }).click();
  await expect(page).toHaveURL(/\/accounts$/);

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

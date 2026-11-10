import { db } from '@/db/schema';

/**
 * يرجّع الجهاز زي أول مرة: يمسح كل بيانات التطبيق من المتصفح.
 * ملفات التطبيق نفسها بتفضل، عشان يفضل بيفتح من غير إنترنت.
 */
export async function eraseDevice(): Promise<void> {
  await db.delete();
  try {
    localStorage.clear();
  } catch {
    // المتصفح مانع التخزين، ومفيش حاجة تتمسح.
  }
  window.location.replace('/');
}

/** يجيب أحدث إصدار من الموقع. يمسح ملفات التطبيق المؤقتة فقط، وبيانات الشيكات في IndexedDB ما بتتلمسش. */

export type ForceUpdateResult = 'offline' | 'reloading';

export async function forceUpdate(): Promise<ForceUpdateResult> {
  // من غير اتصال، مسح الملفات المؤقتة كان هيمنع التطبيق يفتح أصلاً.
  // الرابط الفريد لازم عشان خادم الخدمة ما يردش من ملفاته المخزنة ويوهمنا إن فيه اتصال.
  try {
    const response = await fetch(`/index.html?update-check=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return 'offline';
  } catch {
    return 'offline';
  }

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
  if ('caches' in window) {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  }
  window.location.reload();
  return 'reloading';
}

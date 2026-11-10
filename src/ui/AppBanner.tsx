/** بانر التطبيق: مربع على الموبايل، وعريض على الشاشات الأكبر. */
export function AppBanner() {
  return (
    <picture>
      <source media="(max-width: 640px)" srcSet="/banner/shikaty-banner-square.jpg" width={1080} height={1080} />
      <img
        src="/banner/shikaty-banner-wide.jpg" width={2400} height={800} decoding="async"
        alt="شيكاتي: شيكاتك مكتوبة صح، ومطبوعة في مكانها بالمليمتر"
        className="block h-auto w-full rounded-lg"
      />
    </picture>
  );
}

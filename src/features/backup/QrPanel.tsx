import { useEffect, useState } from 'react';
import { encodeQrItem, type QrItem } from '@/backup/qr';
import { Button, Notice } from '@/ui/controls';

/** يعرض رمز QR لعنصر صغير، عشان زميل يصوّره. */
export function QrPanel({ item, label, onClose }: { item: QrItem; label: string; onClose: () => void }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [{ default: QRCode }, text] = await Promise.all([import('qrcode'), encodeQrItem(item)]);
        const url = await QRCode.toDataURL(text, { errorCorrectionLevel: 'L', margin: 2, width: 560 });
        if (alive) setImage(url);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => { alive = false; };
  }, [item]);

  return (
    <section aria-label="رمز النقل" className="mb-6 flex max-w-md flex-col gap-3 rounded-md border border-rule bg-surface p-4">
      <h2 className="font-bold">{label}</h2>
      {error && <Notice tone="danger">{error}</Notice>}
      {image && <img src={image} alt="رمز لنقل البيانات لجهاز تاني" className="w-full max-w-72 self-center" />}
      <p className="text-sm text-ink-soft">زميلك يصوّره من شاشة النسخ الاحتياطي، في «استقبال برمز». صورة الشيك مش بتتنقل بالرمز.</p>
      <Button variant="ghost" className="self-start" onClick={onClose}>إغلاق</Button>
    </section>
  );
}

/** تسليم ملف PDF: على الموبايل نافذة المشاركة، وعلى الكمبيوتر فتح الملف في تبويب جديد. */
import { downloadBlob } from '@/ui/download';

export const isMobileDevice = () => window.matchMedia('(pointer: coarse)').matches;

export type DeliverResult = 'shared' | 'opened' | 'cancelled' | 'blocked';

export async function deliverPdf(blob: Blob, filename: string): Promise<DeliverResult> {
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (isMobileDevice() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
  if (opened) return 'opened';
  // المتصفح منع النافذة: الملف يتنزل بدل ما يضيع.
  downloadBlob(blob, filename);
  return 'blocked';
}

export const savePdf = (blob: Blob, filename: string) => downloadBlob(blob, filename);

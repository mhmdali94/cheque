import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { warpPixels, type Point } from '@/core/homography';
import { newId } from '@/db/repos';
import { db } from '@/db/schema';
import { Button, Notice } from '@/ui/controls';

/** ١٠ بكسل لكل مليمتر تكفي للمعاينة، وحجم الملف يفضل معقول. */
const PIXELS_PER_MM = 10;
/** الصورة الأصلية بتتصغر لحد مناسب لذاكرة الموبايل قبل المعالجة. */
const MAX_SOURCE_SIDE = 2400;

interface LoadedPhoto {
  canvas: HTMLCanvasElement;
  url: string;
}

const CORNER_NAMES = ['الركن الشمال فوق', 'الركن اليمين فوق', 'الركن اليمين تحت', 'الركن الشمال تحت'];

async function loadPhoto(file: File): Promise<LoadedPhoto> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, MAX_SOURCE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error())), 'image/jpeg', 0.9));
  return { canvas, url: URL.createObjectURL(blob) };
}

async function rectify(photo: LoadedPhoto, corners: Point[], lengthMm: number, widthMm: number): Promise<Blob> {
  const { canvas } = photo;
  const source = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
  const width = Math.round(lengthMm * PIXELS_PER_MM);
  const height = Math.round(widthMm * PIXELS_PER_MM);
  const pixels = warpPixels(source, corners, width, height);

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  out.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error())), 'image/jpeg', 0.82));
}

interface PhotoCaptureProps {
  lengthMm: number;
  widthMm: number;
  onSaved: (imageId: string) => void;
}

/** تصوير الشيك الفارغ أو رفع صورته، ثم تحديد أركانه الأربعة. */
export function PhotoCapture({ lengthMm, widthMm, onSaved }: PhotoCaptureProps) {
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [corners, setCorners] = useState<Point[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const stageRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  const pick = async (file?: File) => {
    if (!file) return;
    setError('');
    try {
      const loaded = await loadPhoto(file);
      const { width, height } = loaded.canvas;
      const [mx, my] = [width * 0.08, height * 0.08];
      setCorners([{ x: mx, y: my }, { x: width - mx, y: my }, { x: width - mx, y: height - my }, { x: mx, y: height - my }]);
      setPhoto(loaded);
    } catch {
      setError('تعذر فتح الصورة. جرّب صورة تانية.');
    }
  };

  const movePoint = (event: PointerEvent<SVGElement>) => {
    const index = dragging.current;
    const stage = stageRef.current;
    if (index === null || !stage || !photo) return;
    const rect = stage.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * photo.canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * photo.canvas.height;
    setCorners((list) => list.map((p, i) => (i === index ? { x, y } : p)));
  };

  const nudge = (index: number, dx: number, dy: number) => {
    setCorners((list) => list.map((p, i) => (i === index ? { x: p.x + dx, y: p.y + dy } : p)));
  };

  const save = async () => {
    if (!photo) return;
    setBusy(true);
    setError('');
    try {
      const data = await rectify(photo, corners, lengthMm, widthMm);
      const id = newId();
      await db.images.add({ id, mime: 'image/jpeg', data, updatedAt: Date.now() });
      setPhoto(null);
      onSaved(id);
    } catch {
      setError('الأركان مش مظبوطة. حرّكها على أركان الشيك وجرّب تاني.');
    } finally {
      setBusy(false);
    }
  };

  if (!photo) {
    return (
      <div className="flex flex-col gap-2">
        <label className="inline-flex min-h-11 w-fit cursor-pointer items-center rounded-md border border-rule-strong bg-surface px-4 text-sm font-semibold hover:bg-sunken focus-within:outline-2 focus-within:outline-accent">
          صوّر الشيك الفارغ أو ارفع صورته
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    );
  }

  const { width, height } = photo.canvas;
  const radius = Math.max(width, height) * 0.018;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-soft">حرّك النقط الأربعة على أركان الشيك بالظبط. الأسهم بتحرك النقطة المحددة بدقة.</p>
      <svg
        ref={stageRef} viewBox={`0 0 ${width} ${height}`} className="block w-full touch-none rounded-sm" role="group" aria-label="تحديد أركان الشيك"
        onPointerMove={movePoint} onPointerUp={() => { dragging.current = null; }} onPointerLeave={() => { dragging.current = null; }}
      >
        <image href={photo.url} width={width} height={height} />
        <polygon points={corners.map((p) => `${p.x},${p.y}`).join(' ')} fill="oklch(0.6 0.1 165 / 0.15)" stroke="oklch(0.6 0.15 165)" strokeWidth={radius / 5} />
        {corners.map((point, index) => (
          <circle
            key={index} cx={point.x} cy={point.y} r={radius} tabIndex={0} role="slider" aria-label={CORNER_NAMES[index]} aria-valuenow={Math.round(point.x)}
            fill="oklch(0.6 0.15 165 / 0.75)" stroke="white" strokeWidth={radius / 6} className="cursor-grab"
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); dragging.current = index; }}
            onKeyDown={(e) => {
              const step = Math.max(width, height) / 800;
              const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
              if (moves[e.key]) { e.preventDefault(); nudge(index, ...moves[e.key]); }
            }}
          />
        ))}
      </svg>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex gap-2">
        <Button variant="primary" disabled={busy} onClick={() => void save()}>{busy ? 'جاري الحفظ...' : 'احفظ الصورة'}</Button>
        <Button variant="ghost" onClick={() => setPhoto(null)}>إلغاء</Button>
      </div>
    </div>
  );
}

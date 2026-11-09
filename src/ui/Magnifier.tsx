import { useRef, useState, type PointerEvent, type ReactNode } from 'react';

const ZOOM = 3;
const LENS_PX = 220;

/** عدسة مكبّرة فوق المعاينة، بالماوس فقط. على الموبايل التكبير بالأصابع. */
export function Magnifier({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [lens, setLens] = useState<{ x: number; y: number; width: number } | null>(null);

  const move = (event: PointerEvent) => {
    if (!enabled || event.pointerType === 'touch' || !hostRef.current) return;
    const rect = hostRef.current.getBoundingClientRect();
    setLens({ x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width });
  };

  return (
    <div ref={hostRef} className="relative" onPointerMove={move} onPointerLeave={() => setLens(null)}>
      {children}
      {enabled && lens && (
        <div
          aria-hidden className="pointer-events-none absolute overflow-hidden rounded-full border border-rule-strong bg-surface"
          style={{ width: LENS_PX, height: LENS_PX, left: lens.x - LENS_PX / 2, top: lens.y - LENS_PX / 2 }}
        >
          <div
            style={{
              width: lens.width, transformOrigin: '0 0',
              transform: `translate(${LENS_PX / 2 - lens.x * ZOOM}px, ${LENS_PX / 2 - lens.y * ZOOM}px) scale(${ZOOM})`,
            }}
          >
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

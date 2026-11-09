/** رسومات معالجات الطباعة. */

const TEXT = 'oklch(0.3 0.02 165)';
const PAPER = 'oklch(0.97 0.01 88)';
const LINE = 'oklch(0.55 0.02 88)';
const ACCENT = 'oklch(0.42 0.09 165)';

/** الشيك في الدرج بالاتجاه المعتمد: واقف بالطول، الوش لفوق، حافة الشعار لجوه. */
export function TrayIllustration() {
  return (
    <svg viewBox="0 0 260 240" className="w-full max-w-sm" role="img" aria-label="الشيك داخل الدرج الأمامي بالطول، والوش لفوق، وحافة الشعار داخلة الأول، والموجهين مقفولين عليه" fontFamily="Cairo, sans-serif">
      <rect x="30" y="8" width="200" height="30" fill="oklch(0.85 0.01 88)" stroke={LINE} />
      <text x="130" y="28" textAnchor="middle" fontSize="12" fill={TEXT}>الطابعة</text>
      <polygon points="50,38 210,38 240,225 20,225" fill="oklch(0.93 0.01 88)" stroke={LINE} />
      <rect x="88" y="48" width="84" height="160" fill={PAPER} stroke={TEXT} />
      <text x="130" y="66" textAnchor="middle" fontSize="11" fill={TEXT}>حافة الشعار</text>
      <text x="130" y="140" textAnchor="middle" fontSize="12" fontWeight="700" fill={TEXT}>الوش لفوق</text>
      <text transform="translate(196 130) rotate(90)" textAnchor="middle" fontSize="10" fill={TEXT}>ناحية التاريخ</text>
      <text transform="translate(64 130) rotate(-90)" textAnchor="middle" fontSize="10" fill={TEXT}>شريط الترميز</text>
      <rect x="78" y="80" width="10" height="90" fill={ACCENT} />
      <rect x="172" y="80" width="10" height="90" fill={ACCENT} />
      <path d="M130 112 L130 78 M124 84 L130 78 L136 84" stroke={ACCENT} strokeWidth="2.5" fill="none" />
    </svg>
  );
}

export type OutcomeId = 'correct' | 'flipped' | 'mirrored' | 'backFace';

/** شكل الورقة زي ما طلعت من الطابعة، ماسكها في وضع قراءة الشيك. */
export function OutcomeIllustration({ outcome }: { outcome: OutcomeId }) {
  const transform = {
    correct: '',
    flipped: 'rotate(180 70 35)',
    mirrored: 'translate(140 0) scale(-1 1)',
    backFace: '',
  }[outcome];
  return (
    <svg viewBox="0 0 140 70" className="w-full" aria-hidden fontFamily="Cairo, sans-serif">
      <rect x="1" y="1" width="138" height="68" fill={outcome === 'backFace' ? 'oklch(0.86 0.01 88)' : PAPER} stroke={LINE} />
      {outcome !== 'backFace' && (
        <g transform={transform}>
          <path d="M70 42 L70 14 M62 22 L70 14 L78 22" stroke={TEXT} strokeWidth="2.5" fill="none" />
          <text x="70" y="60" textAnchor="middle" fontSize="15" fontWeight="700" fill={TEXT}>أعلى</text>
        </g>
      )}
      {outcome === 'backFace' && <text x="70" y="40" textAnchor="middle" fontSize="11" fill={TEXT}>الوش اللي فوق فاضي</text>}
    </svg>
  );
}

export type ShiftId = 'down' | 'up' | 'right' | 'left';

/** الكلام طلع فين بالنسبة لمكانه الصحيح. */
export function ShiftIllustration({ shift }: { shift: ShiftId }) {
  const offset = { down: [0, 10], up: [0, -10], right: [14, 0], left: [-14, 0] }[shift];
  return (
    <svg viewBox="0 0 140 70" className="w-full" aria-hidden>
      <rect x="1" y="1" width="138" height="68" fill={PAPER} stroke={LINE} />
      {[22, 36, 50].map((y) => <line key={y} x1="30" x2="110" y1={y} y2={y} stroke={LINE} strokeDasharray="3 3" />)}
      <g transform={`translate(${offset[0]} ${offset[1]})`}>
        {[22, 36, 50].map((y) => <line key={y} x1="30" x2="110" y1={y} y2={y} stroke={ACCENT} strokeWidth="3" />)}
      </g>
    </svg>
  );
}

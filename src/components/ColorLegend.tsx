import { useMemo, useRef, useEffect } from 'react';

// Keep colors in sync with ScatterPlot
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rampBlueOrange = (t: number): [number, number, number] => {
  const r = Math.round(lerp(66, 255, t));
  const g = Math.round(lerp(135, 165, t));
  const b = Math.round(lerp(245, 0, t));
  return [r, g, b];
};
// const hash = (s: string) => {
//   let h = 2166136261 >>> 0;
//   for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
//   return h >>> 0;
// };
// const labelToColor = (label?: number | string | null): [number,number,number] => {
//   if (label == null || (typeof label === 'number' && label === -1)) return [160,160,160];
//   const idx = typeof label === 'number' ? label : hash(label) % 10000;
//   const g = 0.61803398875, h = (idx * g) % 1, s = 0.55, l = 0.55;
//   const hue2rgb = (p: number, q: number, t: number) => {
//     if (t < 0) t += 1; if (t > 1) t -= 1;
//     if (t < 1/6) return p + (q - p) * 6 * t;
//     if (t < 1/2) return q;
//     if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
//     return p;
//   };
//   const q = l < 0.5 ? l*(1+s) : l + s - l*s, p = 2*l - q;
//   return [
//     Math.round(hue2rgb(p,q,h+1/3)*255),
//     Math.round(hue2rgb(p,q,h)*255),
//     Math.round(hue2rgb(p,q,h-1/3)*255),
//   ];
// };


const labelToColor = (label?: number | string | null): [number, number, number] => {
  if (label == null || (typeof label === 'number' && label === -1)) {
    return [160, 160, 160]; // noise / undefined
  }

  // Stable golden ratio hashing
  const idx = typeof label === 'number' ? label : hash(label);
  const g = 0.61803398875;
  const h = (idx * g) % 1;
  const s = 0.55, l = 0.55;

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p0 = 2 * l - q;

  return [
    Math.round(hue2rgb(p0, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p0, q, h) * 255),
    Math.round(hue2rgb(p0, q, h - 1 / 3) * 255),
  ];
}

const hash = (s: string) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}




type Props = {
  mode: 'cluster' | 'score' | string; // accepts "feature:*" too
  scheme: string;
  clusterValues: Array<string | number>;
  maxShow?: number; // how many cluster chips to show
};

export default function ColorLegend({ mode, scheme, clusterValues, maxShow = 20 }: Props) {
  const isScore = mode === 'score' || (typeof mode === 'string' && mode.startsWith('feature:'));
  const featureName = typeof mode === 'string' && mode.startsWith('feature:') ? mode.slice(8) : null;

  const shown = useMemo(() => {
    const vals = [...clusterValues].sort((a: any, b: any) => {
      // stable order: numbers sorted; strings alphabetical
      const an = Number.isFinite(Number(a)); const bn = Number.isFinite(Number(b));
      if (an && bn) return Number(a) - Number(b);
      if (an) return -1;
      if (bn) return 1;
      return String(a).localeCompare(String(b));
    });
    return vals.slice(0, maxShow);
  }, [clusterValues, maxShow]);

  return (
    <div style={{
      position: 'absolute',
      right: 12, bottom: 12, zIndex: 1000,
      minWidth: 260,
      background: 'rgba(20,20,20,0.85)', color: '#e5e5e5',
      padding: 12, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      fontSize: 12
    }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>
        {isScore
          ? featureName ? `Color · feature: ${featureName}` : 'Color · score'
          : `Color · cluster (${scheme})`}
      </div>

      {isScore ? <ScoreGradient /> : <ClusterChips values={shown} total={clusterValues.length} />}

      {(!isScore && clusterValues.length > shown.length) && (
        <div style={{ marginTop: 6, opacity: 0.75 }}>
          +{clusterValues.length - shown.length} more clusters (not shown)
        </div>
      )}
    </div>
  );
}

function ScoreGradient() {
  const cRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = cRef.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = 200, H = 16;
    c.width = W * dpr; c.height = H * dpr;
    c.style.width = W + 'px'; c.style.height = H + 'px';
    const ctx = c.getContext('2d'); if (!ctx) return;
    for (let x = 0; x < c.width; x++) {
      const t = x / c.width;
      const [r, g, b] = rampBlueOrange(t);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, 0, 1, c.height);
    }
  }, []);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ opacity: 0.8, width: 34, textAlign: 'right' }}>low</span>
        <canvas ref={cRef} />
        <span style={{ opacity: 0.8 }}>high</span>
      </div>
      <div style={{ opacity: 0.7, marginTop: 4, fontSize: 11 }}>
        Gradient maps 0 → blue, 1 → orange.
      </div>
    </div>
  );
}

function ClusterChips({ values }: { values: Array<string | number>; total: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
      {values.map((v) => {
        const [r, g, b] = labelToColor(v as any);
        return (
          <div key={String(v)} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 8px',
            background: 'rgba(255,255,255,0.04)'
          }}>
            <span style={{
              width: 14, height: 14, borderRadius: 4,
              background: `rgb(${r},${g},${b})`, border: '1px solid rgba(0,0,0,0.35)'
            }} />
            <span style={{ fontWeight: 600 }}>{String(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

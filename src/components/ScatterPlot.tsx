import { useEffect, useMemo, useRef, useState } from 'react';
import type { PositionItem } from '../types';

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rampBlueOrange = (t: number): [number, number, number] => {
  const r = Math.round(lerp(66, 255, t));
  const g = Math.round(lerp(135, 165, t));
  const b = Math.round(lerp(245, 0, t));
  return [r, g, b];
};
const hashLabel = (x: string) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const labelToColor = (label?: number | string | null): [number, number, number] => {
  if (label == null || (typeof label === 'number' && label === -1)) return [160,160,160];
  const idx = typeof label === 'number' ? label : hashLabel(label) % 10000;
  const g = 0.61803398875, h = (idx * g) % 1, s = 0.55, l = 0.55;
  const hue2rgb = (p: number, q: number, t: number) => { if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p; };
  const q = l < 0.5 ? l*(1+s) : l + s - l*s, p = 2*l - q;
  return [
    Math.round(hue2rgb(p,q,h+1/3)*255),
    Math.round(hue2rgb(p,q,h)*255),
    Math.round(hue2rgb(p,q,h-1/3)*255),
  ];
};

type Props = {
  positions: PositionItem[];
  scheme: string;
  colorMode: 'cluster' | 'score' | string;
  pointSize: number;
  onHover?: (index: number | null) => void;
  // NEW: pass modifier info so parent can multi-select
  onSelect?: (index: number | null, opts?: { append?: boolean; range?: boolean }) => void;
  setStatus?: (s: string) => void;
};

export default function ScatterPlot({
  positions, scheme, colorMode, pointSize, onHover, onSelect, setStatus
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  const bounds = useMemo(() => {
    if (!positions.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    const xs = positions.map(p => p.x), ys = positions.map(p => p.y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }, [positions]);

  const worldToScreen = (x: number, y: number, w: number, h: number) => {
    const cx = w/2, cy = h/2;
    return [cx + (x * scale + tx), cy - (y * scale + ty)] as const;
  };

  // fit
  useEffect(() => {
    const fit = () => {
      const canvas = canvasRef.current; if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.parentElement?.clientWidth || window.innerWidth;
      const h = canvas.parentElement?.clientHeight || window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';

      const pad = 20 * dpr;
      const spanX = Math.max(1e-6, bounds.maxX - bounds.minX);
      const spanY = Math.max(1e-6, bounds.maxY - bounds.minY);
      const sX = (w * dpr - 2 * pad) / spanX;
      const sY = (h * dpr - 2 * pad) / spanY;
      const s = Math.min(sX, sY);
      setScale(s);
      const cx = (bounds.maxX + bounds.minX) / 2;
      const cy = (bounds.maxY + bounds.minY) / 2;
      setTx(-cx * s); setTy(-cy * s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY]);

  // draw
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.imageSmoothingEnabled = false;

    const t0 = performance.now();
    for (let i=0;i<positions.length;i++) {
      const p = positions[i];
      const [sx, sy] = worldToScreen(p.x, p.y, canvas.width, canvas.height);

      let rgb: [number,number,number];
      if (colorMode === 'cluster') {
        rgb = labelToColor(p.cluster_labels?.[scheme] as any);
      } else if (typeof colorMode === 'string' && colorMode.startsWith('feature:')) {
        // (optional) your feature coloring hook can live here
        const v = Number((p.features as any)?.[colorMode.slice(8)]) || 0;
        rgb = rampBlueOrange(clamp(v,0,1));
      } else {
        const s = clamp(p.metadata?.prediction?.score ?? (p as any)?.features?.score ?? 0, 0, 1);
        rgb = rampBlueOrange(s);
      }

      ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(1.5, pointSize) * dpr, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    const t1 = performance.now();
    setStatus?.(`${positions.length} points · draw ${(t1 - t0).toFixed(1)}ms`);
  }, [positions, scheme, colorMode, pointSize, scale, tx, ty, setStatus]);

  // interactions
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    let dragging = false, lastX = 0, lastY = 0;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const dpr = window.devicePixelRatio || 1;
      const cx = canvas.width / 2, cy = canvas.height / 2;
      const wx = ((mx * dpr - cx) - tx) / scale;
      const wy = -(((my * dpr - cy) - ty) / scale);
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.max(0.1, Math.min(1000, scale * factor));
      const dx = wx * (newScale - scale);
      const dy = wy * (newScale - scale);
      setScale(newScale);
      setTx(tx - dx);
      setTy(ty - dy);
    };

    const onDown = (e: MouseEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
    const onUp = () => { dragging = false; };
    const onMove = (e: MouseEvent) => {
      if (dragging) {
        const dpr = window.devicePixelRatio || 1;
        setTx(tx + (e.clientX - lastX) * dpr);
        setTy(ty - (e.clientY - lastY) * dpr);
        lastX = e.clientX; lastY = e.clientY;
      } else {
        // hover: pick nearest within radius
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * (window.devicePixelRatio || 1);
        const my = (e.clientY - rect.top) * (window.devicePixelRatio || 1);
        let best = -1, bestD = 16*16;
        for (let i=0;i<positions.length;i++) {
          const p = positions[i];
          const [sx, sy] = worldToScreen(p.x, p.y, canvas.width, canvas.height);
          const dx = sx - mx, dy = sy - my;
          const d2 = dx*dx + dy*dy;
          if (d2 < bestD) { bestD = d2; best = i; }
        }
        onHover?.(best >= 0 ? best : null);
      }
    };

    // NEW: click picks nearest; modifier keys decide append/replace
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (window.devicePixelRatio || 1);
      const my = (e.clientY - rect.top) * (window.devicePixelRatio || 1);
      let best = -1, bestD = 16*16;
      for (let i=0;i<positions.length;i++) {
        const p = positions[i];
        const [sx, sy] = worldToScreen(p.x, p.y, canvas.width, canvas.height);
        const dx = sx - mx, dy = sy - my;
        const d2 = dx*dx + dy*dy;
        if (d2 < bestD) { bestD = d2; best = i; }
      }
      const append = e.metaKey || e.ctrlKey;   // ⌘/Ctrl adds/toggles
      const range = e.shiftKey;                // reserved for future
      if (best >= 0) onSelect?.(best, { append, range });
      else onSelect?.(null, { append, range });
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('click', onClick);
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('click', onClick);
    };
  }, [positions, scheme, colorMode, pointSize, scale, tx, ty, onHover, onSelect]);

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />;
}

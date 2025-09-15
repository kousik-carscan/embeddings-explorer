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
const hash = (s: string) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const labelToColor = (label?: number | string | null): [number, number, number] => {
  if (label == null || (typeof label === 'number' && label === -1)) return [160, 160, 160];
  const idx = typeof label === 'number' ? label : hash(label);
  const g = 0.61803398875, h = (idx * g) % 1, s = 0.55, l = 0.55;
  const hue2rgb = (p: number, q: number, t: number) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p0 = 2 * l - q;
  return [
    Math.round(hue2rgb(p0, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p0, q, h) * 255),
    Math.round(hue2rgb(p0, q, h - 1 / 3) * 255),
  ];
};

type Props = {
  positions: PositionItem[];
  scheme: string;
  colorMode: 'cluster' | 'score' | string;
  pointSize: number;
  onHover?: (index: number | null) => void;
  onSelect?: (index: number | null, opts?: { append?: boolean; range?: boolean }) => void;
  setStatus?: (s: string) => void;
  onBoxSelect?: (indices: number[], opts?: { append?: boolean }) => void;
  selectionShape?: 'rect' | 'circle';
};

const UI_SYNC_MS = 80;
const CAMERA_LERP = 0.22;
const INERTIA_DECAY = 0.92;
const PICK_R2 = 16 * 16;

// NEW: anti-ghost-drag knobs
const WHEEL_DEADZONE = 2;                 // px*dpr: ignore micro wheel noise
const WHEEL_SUPPRESS_MS_AFTER_PAN = 140;  // ms: ignore tiny wheels right after pan end

export default function ScatterPlot({
  positions, scheme, colorMode, pointSize, onHover, onSelect, setStatus,
  onBoxSelect, selectionShape = 'rect'
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  // UI mirrors (read-only for display; camera uses refs)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [, setScale] = useState(1);
  const [, setTx] = useState(0);
  const [, setTy] = useState(0);

  // Camera CURRENT values (read by draw)
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);

  // Camera TARGET values (written by interactions)
  const targetScaleRef = useRef(1);
  const targetTxRef = useRef(0);
  const targetTyRef = useRef(0);

  // Velocity for inertia
  const vxRef = useRef(0);
  const vyRef = useRef(0);

  // anim loop
  const animatingRef = useRef(false);
  const lastUiSyncRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // NEW: remember when pan ended
  const lastPanEndAtRef = useRef(0);

  // const bounds = useMemo(() => {
  //   if (!positions.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  //   const xs = positions.map(p => p.x), ys = positions.map(p => p.y);
  //   return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  // }, [positions]);

  // Replace your current bounds useMemo with this:
  const bounds = useMemo(() => {
    if (!positions.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    // Single pass; no spreads
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const x = p.x;
      const y = p.y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    // Fallback if anything was NaN/undefined
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
      return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    }
    // Avoid zero span to prevent div-by-zero during fit
    if (minX === maxX) { minX -= 1; maxX += 1; }
    if (minY === maxY) { minY -= 1; maxY += 1; }

    return { minX, maxX, minY, maxY };
  }, [positions]);


  const worldToScreen = (x: number, y: number, w: number, h: number) => {
    const cx = w / 2, cy = h / 2;
    return [cx + (x * scaleRef.current + txRef.current), cy - (y * scaleRef.current + tyRef.current)] as const;
  };
  const screenToWorld = (sx: number, sy: number, w: number, h: number) => {
    const cx = w / 2, cy = h / 2;
    return [((sx - cx) - txRef.current) / scaleRef.current, -(((sy - cy) - tyRef.current) / scaleRef.current)] as const;
  };

  const cancelInertia = () => {
    vxRef.current = 0;
    vyRef.current = 0;
  };

  // size & initial fit
  useEffect(() => {
    const fit = () => {
      const c = canvasRef.current, o = overlayRef.current; if (!c || !o) return;
      const dpr = window.devicePixelRatio || 1;
      const w = c.parentElement?.clientWidth || window.innerWidth;
      const h = c.parentElement?.clientHeight || window.innerHeight;
      for (const el of [c, o]) {
        el.width = Math.floor(w * dpr);
        el.height = Math.floor(h * dpr);
        el.style.width = w + 'px';
        el.style.height = h + 'px';
        (el.style as any).touchAction = 'none';
        (el.style as any).cursor = 'grab';
      }
      const pad = 20 * dpr;
      const spanX = Math.max(1e-6, bounds.maxX - bounds.minX);
      const spanY = Math.max(1e-6, bounds.maxY - bounds.minY);
      const sX = (c.width - 2 * pad) / spanX;
      const sY = (c.height - 2 * pad) / spanY;
      const s = Math.min(sX, sY);
      const cx = (bounds.maxX + bounds.minX) / 2;
      const cy = (bounds.maxY + bounds.minY) / 2;

      // start settled
      scaleRef.current = targetScaleRef.current = s;
      txRef.current = targetTxRef.current = -cx * s;
      tyRef.current = targetTyRef.current = -cy * s;

      setScale(s); setTx(txRef.current); setTy(tyRef.current);
      requestFrame();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY]);

  // draw
  const draw = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    const key = (scheme ?? '').trim();
    const t0 = performance.now();
    const R = Math.max(1.5, pointSize) * dpr;

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const [sx, sy] = worldToScreen(p.x, p.y, canvas.width, canvas.height);
      if (sx < -R || sy < -R || sx > canvas.width + R || sy > canvas.height + R) continue;

      let rgb: [number, number, number];
      if (colorMode === 'cluster') {
        rgb = labelToColor(p.cluster_labels?.[key] as any);
      } else if (typeof colorMode === 'string' && colorMode.startsWith('feature:')) {
        const v = Number((p.features as any)?.[colorMode.slice(8)]) || 0;
        rgb = rampBlueOrange(clamp(v, 0, 1));
      } else {
        const s = clamp(p.metadata?.prediction?.score ?? (p as any)?.features?.score ?? 0, 0, 1);
        rgb = rampBlueOrange(s);
      }

      ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
      ctx.beginPath();
      ctx.arc(sx, sy, R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const dt = performance.now() - t0;
    const now = performance.now();
    if (!lastUiSyncRef.current || now - lastUiSyncRef.current > 120) {
      setStatus?.(`${positions.length} points · draw ${dt.toFixed(1)}ms`);
      lastUiSyncRef.current = now;
    }
  };

  // animation loop: ease current camera -> target camera
  const tick = () => {
    scaleRef.current = lerp(scaleRef.current, targetScaleRef.current, CAMERA_LERP);
    txRef.current = lerp(txRef.current, targetTxRef.current, CAMERA_LERP);
    tyRef.current = lerp(tyRef.current, targetTyRef.current, CAMERA_LERP);

    draw();

    const done =
      Math.abs(scaleRef.current - targetScaleRef.current) < 0.02 &&
      Math.abs(txRef.current - targetTxRef.current) < 0.5 &&
      Math.abs(tyRef.current - targetTyRef.current) < 0.5;

    const now = performance.now();
    if (!lastUiSyncRef.current || now - lastUiSyncRef.current > UI_SYNC_MS) {
      setScale(scaleRef.current); setTx(txRef.current); setTy(tyRef.current);
      lastUiSyncRef.current = now;
    }

    if (!done) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      animatingRef.current = false;
      rafRef.current = null;
    }
  };

  const requestFrame = () => {
    if (animatingRef.current) return;
    animatingRef.current = true;
    rafRef.current = requestAnimationFrame(tick);
  };

  // interactions
  useEffect(() => {
    const canvas = canvasRef.current, overlay = overlayRef.current;
    if (!canvas || !overlay) return;

    let panning = false;
    let lastX = 0, lastY = 0;
    let moved = false;

    // marquee
    let isMarquee = false, append = false;
    let startSX = 0, startSY = 0, endSX = 0, endSY = 0;

    const drawMarquee = () => {
      const ctx = overlay.getContext('2d'); if (!ctx) return;
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      ctx.save();
      ctx.fillStyle = 'rgba(96,165,250,0.15)';
      ctx.strokeStyle = 'rgba(96,165,250,0.9)';
      ctx.lineWidth = Math.max(1, (window.devicePixelRatio || 1));
      if (selectionShape === 'rect') {
        const x = Math.min(startSX, endSX), y = Math.min(startSY, endSY);
        const w = Math.abs(endSX - startSX), h = Math.abs(endSY - startSY);
        ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
      } else {
        const cx = (startSX + endSX) / 2, cy = (startSY + endSY) / 2;
        const r = Math.max(Math.abs(endSX - startSX), Math.abs(endSY - startSY)) / 2;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    };
    const clearMarquee = () => { const ctx = overlay.getContext('2d'); if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height); };

    // ---- WHEEL: mouse wheel zooms; trackpad two-finger scroll pans; pinch/Alt/Meta zoom too ----
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      // stop any lingering inertia when a wheel gesture starts
      cancelInertia();

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      const toPx = (v: number) => (e.deltaMode === 1 ? v * 16 : v);
      const dxPx = toPx(e.deltaX) * dpr;
      const dyPx = toPx(e.deltaY) * dpr;

      // Dead-zone: ignore micro wheel noise
      if (Math.abs(dxPx) < WHEEL_DEADZONE && Math.abs(dyPx) < WHEEL_DEADZONE) {
        return;
      }

      // Right after a pan, suppress tiny wheels that feel like "drift"
      const sincePan = performance.now() - lastPanEndAtRef.current;
      if (sincePan >= 0 && sincePan < WHEEL_SUPPRESS_MS_AFTER_PAN &&
        Math.abs(dxPx) < 10 && Math.abs(dyPx) < 10) {
        return;
      }

      const pinchZoom = e.ctrlKey;
      const explicitZoom = e.altKey || e.metaKey;
      const likelyMouseWheel = !pinchZoom && !explicitZoom && Math.abs(dxPx) < 0.5 && Math.abs(dyPx) >= 1;

      const doZoom = pinchZoom || explicitZoom || likelyMouseWheel;

      if (!doZoom) {
        // PAN (trackpad)
        const boost = Math.max(0.7, Math.min(2.0, 1.0 / Math.sqrt(targetScaleRef.current)));
        targetTxRef.current -= dxPx * boost;
        targetTyRef.current -= dyPx * boost;
        requestFrame();
        return;
      }

      // ZOOM around cursor
      const mx = (e.clientX - rect.left) * dpr;
      const my = (e.clientY - rect.top) * dpr;

      const [wx, wy] = screenToWorld(mx, my, canvas.width, canvas.height);

      const dy = Math.max(-0.5, Math.min(0.5, toPx(e.deltaY) / 500)); // sensitivity
      const factor = Math.exp(-dy);

      const curScale = targetScaleRef.current;
      const newScale = Math.max(0.05, Math.min(4000, curScale * factor));

      const ds = newScale - curScale;
      targetScaleRef.current = newScale;
      targetTxRef.current -= wx * ds;
      targetTyRef.current -= wy * ds;

      requestFrame();
    };

    const onPointerDown = (e: PointerEvent) => {
      // kill inertia on new gesture
      cancelInertia();

      // marquee with Shift
      if (e.shiftKey) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        startSX = endSX = (e.clientX - rect.left) * dpr;
        startSY = endSY = (e.clientY - rect.top) * dpr;
        isMarquee = true; append = e.metaKey || e.ctrlKey;
        drawMarquee();
        return;
      }
      panning = true; moved = false;
      lastX = e.clientX; lastY = e.clientY;
      vxRef.current = 0; vyRef.current = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch { }
      (canvas.style as any).cursor = 'grabbing';
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      if (isMarquee) {
        endSX = (e.clientX - rect.left) * dpr;
        endSY = (e.clientY - rect.top) * dpr;
        drawMarquee();
        return;
      }

      if (panning) {
        const dxClient = e.clientX - lastX, dyClient = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        moved = moved || Math.abs(dxClient) + Math.abs(dyClient) > 0;

        const dx = dxClient * dpr, dy = dyClient * dpr;
        vxRef.current = lerp(vxRef.current, dx, 0.5);
        vyRef.current = lerp(vyRef.current, -dy, 0.5);

        targetTxRef.current += dx;
        targetTyRef.current -= dy;

        requestFrame();
      } else {
        const mx = (e.clientX - rect.left) * dpr;
        const my = (e.clientY - rect.top) * dpr;
        let best = -1, bestD = PICK_R2;
        for (let i = 0; i < positions.length; i++) {
          const p = positions[i];
          const [sx, sy] = worldToScreen(p.x, p.y, canvas.width, canvas.height);
          const dx = sx - mx, dy = sy - my, d2 = dx * dx + dy * dy;
          if (d2 < bestD) { bestD = d2; best = i; }
        }
        onHover?.(best >= 0 ? best : null);
      }
    };

    const onPointerUp = (_e: PointerEvent) => {
      if (isMarquee) {
        isMarquee = false;
        const indices: number[] = [];
        if (selectionShape === 'rect') {
          const x0 = Math.min(startSX, endSX), x1 = Math.max(startSX, endSX);
          const y0 = Math.min(startSY, endSY), y1 = Math.max(startSY, endSY);
          for (let i = 0; i < positions.length; i++) {
            const [sx, sy] = worldToScreen(positions[i].x, positions[i].y, canvas.width, canvas.height);
            if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) indices.push(i);
          }
        } else {
          const cx = (startSX + endSX) / 2, cy = (startSY + endSY) / 2;
          const r = Math.max(Math.abs(endSX - startSX), Math.abs(endSY - startSY)) / 2, r2 = r * r;
          for (let i = 0; i < positions.length; i++) {
            const [sx, sy] = worldToScreen(positions[i].x, positions[i].y, canvas.width, canvas.height);
            const dx = sx - cx, dy = sy - cy; if (dx * dx + dy * dy <= r2) indices.push(i);
          }
        }
        clearMarquee();
        if (indices.length) onBoxSelect?.(indices, { append });
        return;
      }

      if (!panning) return;
      panning = false;
      (canvas.style as any).cursor = 'grab';

      // remember pan end time to suppress tiny wheel drift
      lastPanEndAtRef.current = performance.now();

      // inertia
      const stepInertia = () => {
        vxRef.current *= INERTIA_DECAY;
        vyRef.current *= INERTIA_DECAY;
        if (Math.abs(vxRef.current) < 0.1 && Math.abs(vyRef.current) < 0.1) return false;
        targetTxRef.current += vxRef.current;
        targetTyRef.current += vyRef.current;
        requestFrame();
        return true;
      };
      const run = () => { if (stepInertia()) requestAnimationFrame(run); };
      requestAnimationFrame(run);
    };

    const onPointerLeave = () => {
      panning = false;
      (canvas.style as any).cursor = 'grab';
    };

    const onClick = (e: MouseEvent) => {
      if (panning || isMarquee || moved) { moved = false; return; }
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const mx = (e.clientX - rect.left) * dpr, my = (e.clientY - rect.top) * dpr;
      let best = -1, bestD = PICK_R2;
      for (let i = 0; i < positions.length; i++) {
        const [sx, sy] = worldToScreen(positions[i].x, positions[i].y, canvas.width, canvas.height);
        const dx = sx - mx, dy = sy - my, d2 = dx * dx + dy * dy;
        if (d2 < bestD) { bestD = d2; best = i; }
      }
      const appendSel = (e.metaKey || e.ctrlKey);
      if (best >= 0) onSelect?.(best, { append: appendSel });
      else onSelect?.(null, { append: appendSel });
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onPointerDown as any, { passive: false });
    canvas.addEventListener('pointermove', onPointerMove as any, { passive: false });
    canvas.addEventListener('pointerup', onPointerUp as any, { passive: false });
    canvas.addEventListener('pointerleave', onPointerLeave as any, { passive: false });
    canvas.addEventListener('click', onClick as any);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    return () => {
      canvas.removeEventListener('wheel', onWheel as any);
      canvas.removeEventListener('pointerdown', onPointerDown as any);
      canvas.removeEventListener('pointermove', onPointerMove as any);
      canvas.removeEventListener('pointerup', onPointerUp as any);
      canvas.removeEventListener('pointerleave', onPointerLeave as any);
      canvas.removeEventListener('click', onClick as any);
    };
  }, [positions, scheme, colorMode, pointSize, selectionShape, onHover, onSelect, onBoxSelect]);

  // re-draw when inputs (non-camera) change
  useEffect(() => { requestFrame(); }, [positions, scheme, colorMode, pointSize]);

  return (
    <>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />
      <canvas ref={overlayRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
    </>
  );
}

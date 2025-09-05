import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset, PositionItem } from '../types';

type Props = {
  data: Dataset | null;
  items: PositionItem[]; // already selected items
};

type Box = {
  x1: number; y1: number; x2: number; y2: number;
  category: string; score?: number;
  kind: 'prediction' | 'annotation';
};

function getPreviewSrc(item: PositionItem | null): string | null {
  if (!item) return null;
  const p = item.metadata?.image_path || '';
  if (p && /^https?:\/\//i.test(p)) return p;
  // return '/annotation-images/1.jpeg';
  return p;
}

function BBoxOverlay({ item, data }: { item: PositionItem; data: Dataset | null }) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [dim, setDim] = useState({ w: 0, h: 0, naturalW: 0, naturalH: 0 });

  const boxes: Box[] = useMemo(() => {
    const arr: Box[] = [];
    const pred = item.metadata?.prediction;
    if (pred?.bbox?.length === 4) {
      arr.push({
        x1: Number(pred.bbox[0]), y1: Number(pred.bbox[1]),
        x2: Number(pred.bbox[2]), y2: Number(pred.bbox[3]),
        category: String(pred.category ?? ''), score: typeof pred.score === 'number' ? pred.score : undefined,
        kind: 'prediction',
      });
    }
    const anns = data?.annotations?.[String(item.metadata?.image_id)] ?? [];
    for (const ann of anns) {
      if (ann?.bbox?.length === 4) {
        arr.push({
          x1: Number(ann.bbox[0]), y1: Number(ann.bbox[1]),
          x2: Number(ann.bbox[2]), y2: Number(ann.bbox[3]),
          category: String(ann.category ?? ''), kind: 'annotation',
        });
      }
    }
    return arr;
  }, [item, data]);

  useEffect(() => {
    const el = imgRef.current; if (!el) return;
    const sync = () => setDim({
      w: el.clientWidth || 0, h: el.clientHeight || 0,
      naturalW: el.naturalWidth || 0, naturalH: el.naturalHeight || 0
    });
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toCssRect = (b: Box) => {
    const { w, h, naturalW, naturalH } = dim;
    if (!w || !h || !naturalW || !naturalH) return { left: 0, top: 0, width: 0, height: 0 };
    const sx = w / naturalW, sy = h / naturalH;
    const left = Math.round(b.x1 * sx), top = Math.round(b.y1 * sy);
    const width = Math.max(0, Math.round((b.x2 - b.x1) * sx));
    const height = Math.max(0, Math.round((b.y2 - b.y1) * sy));
    return { left, top, width, height };
  };
  const strokeFor = (k: Box['kind']) => k === 'prediction' ? '#22c55e' : '#60a5fa';
  const labelPos = (r: { left: number; top: number; width: number; height: number }) => {
    const labelHeight = 16, pad = 2;
    const fitsAbove = r.top - (labelHeight + 6) >= 0;
    return fitsAbove
      ? { left: r.left + pad, top: r.top - (labelHeight + 6), inside: false }
      : { left: r.left + pad, top: r.top + pad, inside: true };
  };

  const src = getPreviewSrc(item);

  return (
    <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,0.25)' }}>
      <img
        ref={imgRef}
        src={src ?? ''}
        alt={item.metadata?.image_name ?? 'preview'}
        style={{ width: '100%', display: 'block' }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
      {boxes.map((b, i) => {
        const r = toCssRect(b);
        const color = strokeFor(b.kind);
        const lbl = `${b.category}${typeof b.score === 'number' ? ` (${b.score.toFixed(3)})` : ''}`;
        const lp = labelPos(r);
        return (
          <div key={i}>
            <div style={{
              position: 'absolute', left: r.left, top: r.top, width: r.width, height: r.height,
              border: `2px solid ${color}`, borderRadius: 2, pointerEvents: 'none',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.6) inset'
            }} />
            <div style={{
              position: 'absolute', left: lp.left, top: lp.top,
              padding: '2px 6px', fontSize: 11, lineHeight: '14px',
              color: '#fff', background: lp.inside ? 'rgba(0,0,0,0.6)' : color,
              borderRadius: 4, pointerEvents: 'none', whiteSpace: 'nowrap',
              maxWidth: '95%', overflow: 'hidden', textOverflow: 'ellipsis'
            }} title={lbl}>
              {lbl}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MultiPreviewPanel({ data, items }: Props) {
  return (
    <div style={{
      position: 'absolute', right: 12, top: 12, zIndex: 1000,
      width: '500px', maxHeight: '95vh', overflow: 'auto',
      background: 'rgba(20,20,20,0.85)', padding: 12, borderRadius: 12, fontSize: 12
    }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>
        Selected images ({items.length})
      </div>
      {items.length === 0 ? (
        <div style={{ opacity: 0.8, fontSize: 12 }}>
          Click a dot to select, <b>Cmd/Ctrl-click</b> to add more.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map((it) => (
            <div key={it.id} style={{ background: 'rgba(255,255,255,0.06)', padding: 8, borderRadius: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>#{it.id} — {it.metadata?.prediction?.category} · score {typeof it.metadata?.prediction?.score === 'number' ? it.metadata!.prediction!.score!.toFixed(3) : 'n/a'}</div>
              <BBoxOverlay item={it} data={data} />
              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.9 }}>
                <div><b>image</b>: {it.metadata?.image_name}</div>
                <div><b>path</b>: <code style={{ fontSize: 11 }}>{it.metadata?.image_path}</code></div>
                <div><b>bbox</b>: [{(it.metadata?.prediction?.bbox ?? []).join(', ')}]</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

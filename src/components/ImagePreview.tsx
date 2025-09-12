import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset, PositionItem } from '../types';
import { Eye, EyeOff } from 'lucide-react'; // install lucide-react if not already

type Props = {
  data: Dataset | null;
  active: PositionItem | null;
  scheme: string;
};

type Box = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  category: string;
  score?: number;
  kind: 'prediction' | 'annotation';
};

function getPreviewSrc(active: PositionItem | null): string | null {
  if (!active) return null;
  const p = active.metadata?.image_path || '';
  if (p && /^https?:\/\//i.test(p)) return p;
  return '/annotation-images/1.jpeg';
}

export default function ImagePreview({ data, active }: Props) {
  if (!active) return null;

  const previewSrc = getPreviewSrc(active);

  // Collect boxes
  const boxes: Box[] = useMemo(() => {
    const arr: Box[] = [];
    const pred = active.metadata?.prediction;
    if (pred?.bbox?.length === 4) {
      arr.push({
        x1: +pred.bbox[0],
        y1: +pred.bbox[1],
        x2: +pred.bbox[2],
        y2: +pred.bbox[3],
        category: String(pred.category ?? ''),
        score: typeof pred.score === 'number' ? pred.score : undefined,
        kind: 'prediction',
      });
    }
    const anns = data?.annotations?.[String(active.metadata?.image_id)] ?? [];
    for (const ann of anns) {
      if (ann?.bbox?.length === 4) {
        arr.push({
          x1: +ann.bbox[0],
          y1: +ann.bbox[1],
          x2: +ann.bbox[2],
          y2: +ann.bbox[3],
          category: String(ann.category ?? ''),
          kind: 'annotation',
        });
      }
    }
    return arr;
  }, [active, data]);

  // Track image dims
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [dim, setDim] = useState({ w: 0, h: 0, naturalW: 0, naturalH: 0 });

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const sync = () => {
      setDim({
        w: el.clientWidth || 0,
        h: el.clientHeight || 0,
        naturalW: el.naturalWidth || 0,
        naturalH: el.naturalHeight || 0,
      });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewSrc]);

  const toCssRect = (b: Box) => {
    const { w, h, naturalW, naturalH } = dim;
    if (!w || !h || !naturalW || !naturalH) return { left: 0, top: 0, width: 0, height: 0 };
    const scaleX = w / naturalW, scaleY = h / naturalH;
    return {
      left: Math.round(b.x1 * scaleX),
      top: Math.round(b.y1 * scaleY),
      width: Math.round((b.x2 - b.x1) * scaleX),
      height: Math.round((b.y2 - b.y1) * scaleY),
    };
  };

  const strokeFor = (kind: Box['kind']) =>
    kind === 'prediction' ? '#22c55e' : '#60a5fa';

  const labelPos = (r: { left: number; top: number; width: number; height: number }) => {
    const labelHeight = 16, pad = 2;
    const fitsAbove = r.top - (labelHeight + 6) >= 0;
    return fitsAbove
      ? { left: r.left + pad, top: r.top - (labelHeight + 6), inside: false }
      : { left: r.left + pad, top: r.top + pad, inside: true };
  };

  // Visible toggles
  const [visible, setVisible] = useState<boolean[]>(boxes.map(() => true));
  useEffect(() => { setVisible(boxes.map(() => true)); }, [boxes]);

  return (
    <div style={{
      position: 'absolute', right: 12, top: 12, zIndex: 1000,
      width: 400, maxHeight: '95vh', overflow: 'auto',
      background: 'rgba(20,20,20,0.85)', padding: 12, borderRadius: 12, fontSize: 12
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        Selected #{active.id}
      </div>

      {/* Box list with eye toggles */}
      {boxes.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {boxes.map((b, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(255,255,255,0.05)', padding: '4px 6px',
              borderRadius: 6, marginBottom: 4
            }}>
              <span>
                {b.kind} — {b.category}
                {b.score != null && ` (${b.score.toFixed(3)})`}
              </span>
              <button
                onClick={() =>
                  setVisible(v => v.map((vv, j) => j === i ? !vv : vv))
                }
                style={{
                  border: 'none', background: 'transparent',
                  cursor: 'pointer', color: '#eee'
                }}
              >
                {visible[i] ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Image with overlays */}
      <div style={{
        marginTop: 10, position: 'relative', borderRadius: 8,
        overflow: 'hidden', background: 'rgba(0,0,0,0.25)'
      }}>
        <img
          ref={imgRef}
          src={previewSrc ?? ''}
          alt={active.metadata?.image_name ?? 'preview'}
          style={{ maxWidth: '100%', display: 'block' }}
        />
        {boxes.map((b, idx) => {
          if (!visible[idx]) return null;
          const rect = toCssRect(b);
          const color = strokeFor(b.kind);
          const lbl = `${b.category}${typeof b.score === 'number' ? ` (${b.score.toFixed(3)})` : ''}`;
          const lp = labelPos(rect);
          return (
            <div key={idx}>
              <div style={{
                position: 'absolute', left: rect.left, top: rect.top,
                width: rect.width, height: rect.height,
                border: `2px solid ${color}`, borderRadius: 2,
                pointerEvents: 'none', boxShadow: '0 0 0 1px rgba(0,0,0,0.6) inset'
              }}/>
              <div style={{
                position: 'absolute', left: lp.left, top: lp.top,
                padding: '2px 6px', fontSize: 11, lineHeight: '14px',
                color: '#fff', background: lp.inside ? 'rgba(0,0,0,0.6)' : color,
                borderRadius: 4, whiteSpace: 'nowrap'
              }}>
                {lbl}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

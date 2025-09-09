import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset, PositionItem } from '../types';

type Props = {
  data: Dataset | null;
  items: PositionItem[]; // already selected items
  hoverIdx: number | null;
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
  return '/annotation-images/1.jpeg';
}

// -------- BBox overlay (unchanged logic) --------
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
  }, [getPreviewSrc(item)]);

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

// -------------- Slider UI --------------
export default function MultiPreviewPanel({ data, items }: Props) {
  const [idx, setIdx] = useState(0);

  // keep index valid when items change
  useEffect(() => {
    if (idx > items.length - 1) setIdx(Math.max(0, items.length - 1));
  }, [items.length, idx]);

  const hasItems = items.length > 0;
  const current = hasItems ? items[idx] : null;
  const total = items.length;

  const go = (delta: number) => {
    if (!hasItems) return;
    setIdx(i => {
      const n = i + delta;
      if (n < 0) return total - 1;        // wrap
      if (n >= total) return 0;           // wrap
      return n;
    });
  };

  // keyboard left/right
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!hasItems) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(+1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasItems, total]);

  // swipe / drag support
  const dragRef = useRef<{ downX: number; active: boolean }>({ downX: 0, active: false });
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { downX: e.clientX, active: true };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.downX;
    dragRef.current.active = false;
    const THRESH = 40;
    if (dx > THRESH) go(-1);
    else if (dx < -THRESH) go(+1);
  };


  // --------- Features renderer ----------
  const FeaturesTable = ({ item }: { item: PositionItem }) => {
    const feats = item.features ?? {};
    const entries = Object.entries(feats);
    if (!entries.length) return <div style={{ opacity: 0.7 }}>No features present.</div>;
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr',
        gap: '6px 10px',
        fontSize: 12,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)',
        padding: 10,
        borderRadius: 8
      }}>
        {entries.map(([k, v]) => (
          <FragmentRow key={k} k={k} v={v} />
        ))}
      </div>
    );
  };

  const FragmentRow = ({ k, v }: { k: string; v: any }) => {
    const value =
      isNumber(v) ? formatNum(v as number)
        : typeof v === 'boolean' ? (v ? 'true' : 'false')
          : String(v ?? '');
    return (
      <>
        <div style={{ opacity: 0.75 }}>{k}</div>
        <div style={{ fontWeight: 600 }}>{value}</div>
      </>
    );
  };

  // ---------- tiny helpers ----------
  const isNumber = (v: any) => typeof v === 'number' && Number.isFinite(v);
  const formatNum = (v: number) => {
    // Use fewer decimals for large values, 3 decimals for small floats
    if (Math.abs(v) >= 1000) return Math.round(v).toString();
    if (Math.abs(v) >= 10) return v.toFixed(2);
    return v.toFixed(3);
  };

  return (
    <div style={{
      position: 'absolute', right: 12, top: 12, zIndex: 1000,
      width: 560, maxHeight: '95vh', overflow: 'auto',
      background: 'rgba(20,20,20,0.85)', padding: 12, borderRadius: 12, fontSize: 12,
      display: 'flex', flexDirection: 'column', gap: 10
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 700, flex: 1 }}>
          Selected images {hasItems ? `(${idx + 1} / ${total})` : '(0)'}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => go(-1)}
            disabled={!hasItems}
            title="Prev (←)"
            style={{ padding: '6px 10px', borderRadius: 6, background: '#2a2a2a', color: '#eee', border: '1px solid #444' }}
          >◀</button>
          <button
            onClick={() => go(+1)}
            disabled={!hasItems}
            title="Next (→)"
            style={{ padding: '6px 10px', borderRadius: 6, background: '#2a2a2a', color: '#eee', border: '1px solid #444' }}
          >▶</button>
        </div>
      </div>

      {!hasItems ? (
        <div style={{ opacity: 0.8 }}>
          Click a dot to select, <b>Cmd/Ctrl-click</b> to add more.
          Tip: Shift-drag on the plot to box-select multiple.
        </div>
      ) : (
        <div
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          style={{ display: 'grid', gap: 10 }}
        >
          <div style={{ fontWeight: 600 }}>
            #{current!.id} — {current!.metadata?.prediction?.category} · score {typeof current!.metadata?.prediction?.score === 'number' ? current!.metadata!.prediction!.score!.toFixed(3) : 'n/a'}
          </div>



          {/* Quick jump mini-index if you like */}
          {total > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {items.map((it, i) => (
                <button
                  key={it.id}
                  onClick={() => setIdx(i)}
                  title={`Go to ${i + 1}`}
                  style={{
                    width: 22, height: 22, borderRadius: 999,
                    border: '1px solid #444', background: i === idx ? '#60a5fa' : '#2a2a2a',
                    color: i === idx ? '#000' : '#bbb', fontSize: 11
                  }}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}


          <BBoxOverlay item={current!} data={data} />
          <div style={{ fontSize: 11, opacity: 0.9 }}>
            <div><b>image</b>: {current!.metadata?.image_name}</div>
            <div><b>path</b>: <code style={{ fontSize: 11 }}>{current!.metadata?.image_path}</code></div>
            <div><b>bbox</b>: [{(current!.metadata?.prediction?.bbox ?? []).join(', ')}]</div>
          </div>

          {/* NEW: Features */}
          <div style={{ fontWeight: 700, marginTop: 6 }}>Features</div>
          <FeaturesTable item={current!} />

        </div>
      )}
    </div>
  );
}

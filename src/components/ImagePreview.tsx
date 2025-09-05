// import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset, PositionItem } from '../types';

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
  // fallback to local dummy
  return '/annotation-images/1.jpeg';
}

export default function ImagePreview({ data, active, scheme }: Props) {
  if (!active) return null;

  const previewSrc = getPreviewSrc(active);

  // Collect boxes: 1) model prediction; 2) annotations for image_id
  const boxes: Box[] = useMemo(() => {
    const arr: Box[] = [];
    const pred = active.metadata?.prediction;
    if (pred?.bbox?.length === 4) {
      arr.push({
        x1: Number(pred.bbox[0]),
        y1: Number(pred.bbox[1]),
        x2: Number(pred.bbox[2]),
        y2: Number(pred.bbox[3]),
        category: String(pred.category ?? ''),
        score: typeof pred.score === 'number' ? pred.score : undefined,
        kind: 'prediction',
      });
    }
    const anns = data?.annotations?.[String(active.metadata?.image_id)] ?? [];
    for (const ann of anns) {
      if (ann?.bbox?.length === 4) {
        arr.push({
          x1: Number(ann.bbox[0]),
          y1: Number(ann.bbox[1]),
          x2: Number(ann.bbox[2]),
          y2: Number(ann.bbox[3]),
          category: String(ann.category ?? ''),
          kind: 'annotation',
        });
      }
    }
    return arr;
  }, [active, data]);

  // Track rendered image size & natural size for scaling
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [dim, setDim] = useState({ w: 0, h: 0, naturalW: 0, naturalH: 0 });

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;

    const sync = () => {
      const naturalW = el.naturalWidth || 0;
      const naturalH = el.naturalHeight || 0;
      // clientWidth/Height exclude borders/scrollbars; good for overlay positioning
      const w = el.clientWidth || 0;
      const h = el.clientHeight || 0;
      setDim({ w, h, naturalW, naturalH });
    };

    sync();

    // ResizeObserver in case the panel resizes
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewSrc]);

  // Scale function: original pixel bbox -> displayed CSS pixels
  const toCssRect = (b: Box) => {
    const { w, h, naturalW, naturalH } = dim;
    if (!w || !h || !naturalW || !naturalH) {
      // no scaling info yet; return zero rect to avoid flashes
      return { left: 0, top: 0, width: 0, height: 0 };
    }
    const scaleX = w / naturalW;
    const scaleY = h / naturalH;
    const left = Math.round(b.x1 * scaleX);
    const top = Math.round(b.y1 * scaleY);
    const width = Math.max(0, Math.round((b.x2 - b.x1) * scaleX));
    const height = Math.max(0, Math.round((b.y2 - b.y1) * scaleY));
    return { left, top, width, height };
  };

  // choose colors
  const strokeFor = (kind: Box['kind']) =>
    kind === 'prediction' ? '#22c55e' /* green */ : '#60a5fa' /* blue */;

  // compute label position: above if we have room; else inside top-left
  const labelPos = (rect: { left: number; top: number; width: number; height: number }) => {
    const pad = 2;
    const labelHeight = 16; // approx; we can refine if needed
    const fitsAbove = rect.top - (labelHeight + 6) >= 0;
    if (fitsAbove) {
      return {
        left: rect.left + pad,
        top: rect.top - (labelHeight + 6),
        inside: false,
      };
    }
    return {
      left: rect.left + pad,
      top: rect.top + pad,
      inside: true,
    };
  };

  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        top: 12,
        zIndex: 1000,
        width: 380,
        maxHeight: '95vh',
        overflow: 'auto',
        background: 'rgba(20,20,20,0.85)',
        padding: 12,
        borderRadius: 12,
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Selected #{active.id}</div>

      <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 8 }}>
        <div>
          <b>image</b>: {active.metadata?.image_name ?? '(unknown)'}
        </div>
        <div>
          <b>path</b>:{' '}
          <code style={{ fontSize: 11 }}>
            {active.metadata?.image_path ?? '(none)'}
          </code>
        </div>
        <div>
          <b>cluster</b>: {scheme} = {String(active.cluster_labels?.[scheme] ?? '(n/a)')}
        </div>
        <div>
          <b>score</b>:{' '}
          {typeof active.metadata?.prediction?.score === 'number'
            ? active.metadata.prediction.score.toFixed(3)
            : '(n/a)'}
        </div>
        <div>
          <b>bbox</b>:{' '}
          [
          {(active.metadata?.prediction?.bbox ?? [])
            .map((n) => String(n))
            .join(', ')}
          ]
        </div>
        <div>
          <b>eval</b>: {active.features?.eval_type} —{' '}
          {active.metadata?.prediction?.category}
        </div>
      </div>

      <div
        style={{
          fontWeight: 600,
          marginTop: 8,
          marginBottom: 6,
        }}
      >
        Annotations for image_id {active.metadata?.image_id}
      </div>

      <div>
        {(data?.annotations?.[String(active.metadata?.image_id)] ?? []).map(
          (ann, i) => (
            <div key={i} style={{ fontSize: 12, opacity: 0.9 }}>
              #{ann.id} {ann.category} — [{ann.bbox.join(', ')}]
            </div>
          )
        )}
        {!((data?.annotations?.[String(active.metadata?.image_id)] ?? []).length) && (
          <div style={{ fontSize: 12, opacity: 0.7 }}>No annotations.</div>
        )}
      </div>

      {/* Image + overlay */}
      <div
        style={{
          marginTop: 10,
          position: 'relative',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'rgba(0,0,0,0.25)',
        }}
      >
        <img
          ref={imgRef}
          src={previewSrc ?? ''}
          alt={active.metadata?.image_name ?? 'preview'}
          style={{ maxWidth: '100%', display: 'block' }}
          onLoad={() => {
            const el = imgRef.current;
            if (!el) return;
            // trigger dimension sync
            const w = el.clientWidth || 0;
            const h = el.clientHeight || 0;
            setDim({ w, h, naturalW: el.naturalWidth || 0, naturalH: el.naturalHeight || 0 });
          }}
          onError={(e) => {
            // hide broken image icon if even dummy is missing
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />

        {/* Boxes overlay */}
        {boxes.map((b, idx) => {
          const rect = toCssRect(b);
          const color = strokeFor(b.kind);
          const lbl = `${b.category}${typeof b.score === 'number' ? ` (${b.score.toFixed(3)})` : ''}`;
          const lp = labelPos(rect);

          return (
            <div key={idx}>
              {/* rectangle */}
              <div
                style={{
                  position: 'absolute',
                  left: rect.left,
                  top: rect.top,
                  width: rect.width,
                  height: rect.height,
                  border: `2px solid ${color}`,
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.6) inset',
                  borderRadius: 2,
                  pointerEvents: 'none',
                }}
              />
              {/* label */}
              <div
                style={{
                  position: 'absolute',
                  left: lp.left,
                  top: lp.top,
                  padding: '2px 6px',
                  fontSize: 11,
                  lineHeight: '14px',
                  color: '#fff',
                  background: lp.inside ? 'rgba(0,0,0,0.6)' : color,
                  borderRadius: 4,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                  maxWidth: '95%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={lbl}
              >
                {lbl}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dummy source hint (optional) */}
      {previewSrc?.startsWith('/annotation-images/') && (
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>
          Showing placeholder from <code>{previewSrc}</code>
        </div>
      )}
    </div>
  );
}

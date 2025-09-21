import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset, PositionItem } from '../types';
import { Eye, EyeOff } from 'lucide-react';

type Props = {
  data: Dataset | null;
  items: PositionItem[];      // already selected items
  hoverIdx: number | null;
};

type Box = {
  x1: number; y1: number; x2: number; y2: number;
  category: string; score?: number;
  kind: 'prediction' | 'annotation';
};

// --- tiny helper: call your presign API ---
async function fetchPresignedUrl(imageId: string | number, token: string): Promise<string> {
  const url = `https://aicdb.carscan.ai/aicdb/imagesdata/${imageId}/presign_url`;
  // const url = `https://4be6cdff32cb.ngrok-free.app/aicdb/imagesdata/${imageId}/presign_url`;
  const resp = await fetch(url, {
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
      // 'ngrok-skip-browser-warning': '69420'
    },
  });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => '');
    throw new Error(`Presign failed (${resp.status}): ${msg || resp.statusText}`);
  }
  const data = await resp.json();
  // const data = { "success": true, "url": "https://core-s3.staging.carscan.ai/staging-carscan-core-general-files/fb91f0b0-7755-4eef-9dbd-7831396421f9/94f53c2a-4f0a-4bb7-825e-ad9029ee1dd3/original/a0ea4844-f2cf-4fdd-a503-86b89d6d77c4.png?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJhdXRoX2tleSI6ImZiOTFmMGIwLTc3NTUtNGVlZi05ZGJkLTc4MzEzOTY0MjFmOVwvOTRmNTNjMmEtNGYwYS00YmI3LTgyNWUtYWQ5MDI5ZWUxZGQzIiwiZXhwIjoxNzU3OTIyNTA3LCJqdGkiOiI2OTIzZjFmOC02YTU5LTQ5ZTgtOTNlOC1hZTk2NmIyMzYyMGUifQ.og74KKoib5VaUcSX1UlQewFy-lKLCxfVTF2k1U45SYs"}
  if (!data?.url) throw new Error('No presigned url in response');
  return String(data.url);
}

/* ---------------- BBox overlay with per-box eye toggles + presigned fetch ---------------- */
function BBoxOverlay({ item, data }: { item: PositionItem; data: Dataset | null }) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [dim, setDim] = useState({ w: 0, h: 0, naturalW: 0, naturalH: 0 });

  // Presigned/image src state
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cacheRef = useRef<Map<string | number, string>>(new Map());

  // Build boxes array: prediction + all annotations for the same image_id
  const boxes = useMemo<Box[]>(() => {
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

  // Visibility state: one boolean per box (defaults to all visible)
  const [visible, setVisible] = useState<boolean[]>([]);
  useEffect(() => {
    setVisible(new Array(boxes.length).fill(true));
  }, [boxes.length, item?.id]);

  // Decide/resolve image src
  useEffect(() => {
    let cancelled = false;

    async function resolveSrc() {
      setErr(null);
      const rawPath = item?.metadata?.image_path || '';
      const imageId = item?.metadata?.image_id;

      // If already a full http(s) URL, use it as-is
      if (/^https?:\/\//i.test(rawPath)) {
        setSrc(rawPath);
        return;
      }

      // If we already cached a URL for this image_id, reuse it
      if (imageId != null && cacheRef.current.has(imageId)) {
        setSrc(cacheRef.current.get(imageId)!);
        return;
      }

      // Otherwise fetch presigned url (needs token in localStorage)
      if (imageId == null) {
        setErr('No image_id found for presign');
        setSrc(null);
        return;
      }

      const token = localStorage.getItem('authToken');
      if (!token) {
        setErr('Not authenticated. Please login first.');
        setSrc(null);
        return;
      }

      setLoading(true);
      try {
        const url = await fetchPresignedUrl(imageId, token);
        if (!cancelled) {
          cacheRef.current.set(imageId, url);
          setSrc(url);
        }
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message ?? 'Failed to get image URL');
          setSrc(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    resolveSrc();
    return () => { cancelled = true; };
  }, [item?.metadata?.image_id, item?.metadata?.image_path]);

  // Image sizing for overlay scaling
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
  }, [src]);

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

  return (
    <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,0.25)' }}>
      {/* Loading / Error layers */}
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 1, background: 'rgba(0,0,0,0.25)' }}>
          <div style={{ fontSize: 12, opacity: 0.9 }}>Loading image…</div>
        </div>
      )}
      {err && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', zIndex: 1, background: 'rgba(0,0,0,0.35)', color: '#fda4af' }}>
          <div style={{ fontSize: 12, textAlign: 'center' }}>
            {err}<br /><span style={{ opacity: 0.75 }}>Check login / token</span>
          </div>
        </div>
      )}

      {/* Image */}
      {/* <img
        ref={imgRef}
        src={src ?? ''}
        alt={item.metadata?.image_name ?? 'preview'}
        style={{ width: '100%', display: src ? 'block' : 'none' }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      /> */}


      <img
        ref={imgRef}
        src={src ?? ''}
        alt={item.metadata?.image_name ?? 'preview'}
        referrerPolicy="no-referrer"
        style={{ width: '100%', display: src ? 'block' : 'none' }}
        onError={() => setErr('Image failed to load (likely bad Content-Type or expired presign)')}
      />
      {err && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.35)', color: '#fda4af' }}>
          <div style={{ fontSize: 12, textAlign: 'center' }}>{err}</div>
        </div>
      )}


      {/* Overlays */}
      {src && boxes.map((b, i) => {
        if (!visible[i]) return null;
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

      {/* Simple toolbar for per-box visibility */}
      {boxes.length > 0 && (
        <div style={{
          position: 'absolute', left: 8, top: 8,
          display: 'flex', gap: 6, flexWrap: 'wrap',
          background: 'rgba(0,0,0,0.45)', padding: '6px 8px', borderRadius: 6
        }}>
          {boxes.map((b, i) => (
            <button
              key={i}
              onClick={() => setVisible(v => v.map((vv, j) => j === i ? !vv : vv))}
              title={`${visible[i] ? 'Hide' : 'Show'} – ${b.kind === 'prediction' ? 'prediction' : 'annotation'}${b.category ? `: ${b.category}` : ''}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 8px', borderRadius: 6,
                color: '#eee',
                background: visible[i] ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.15)',
                cursor: 'pointer'
              }}
            >
              {visible[i] ? <Eye size={14} /> : <EyeOff size={14} />}
              <span style={{ fontSize: 11 }}>
                {b.kind === 'prediction' ? 'pred' : 'ann'}
                {b.category ? `:${b.category}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Slider panel with features + EXPORT ---------------- */
export default function MultiPreviewPanel({ data, items }: Props) {
  const [idx, setIdx] = useState(0);

  useEffect(() => { if (idx > items.length - 1) setIdx(Math.max(0, items.length - 1)); }, [items.length, idx]);

  const hasItems = items.length > 0;
  const current = hasItems ? items[idx] : null;
  const total = items.length;

  const go = (d: number) => {
    if (!hasItems) return;
    setIdx(i => {
      const n = i + d;
      if (n < 0) return total - 1;
      if (n >= total) return 0;
      return n;
    });
  };

  // swipe / drag
  const dragRef = useRef<{ downX: number; active: boolean }>({ downX: 0, active: false });
  const onPointerDown = (e: React.PointerEvent) => { dragRef.current = { downX: e.clientX, active: true }; };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.downX;
    dragRef.current.active = false;
    const THRESH = 40;
    if (dx > THRESH) go(-1);
    else if (dx < -THRESH) go(+1);
  };

  // --- EXPORT helpers (per current item) ---
  const getAnnotations = (item: PositionItem) =>
    (data?.annotations?.[String(item.metadata?.image_id)] ?? []);

  const makePayload = (item: PositionItem) => ({
    id: item.id,
    x: item.x, y: item.y,
    cluster_labels: item.cluster_labels ?? {},
    metadata: item.metadata ?? {},
    features: item.features ?? {},
    annotations: getAnnotations(item),
  });

  const downloadJSON = (obj: any, filename: string) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportCurrent = () => {
    if (!current) return;
    const payload = makePayload(current);
    const base = current.metadata?.image_name || `image_${current.id}`;
    downloadJSON(payload, `${base.replace(/\s+/g, '_')}.json`);
  };

  const copyCurrent = async () => {
    if (!current) return;
    const payload = makePayload(current);
    const text = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      alert('Copied JSON to clipboard');
    } catch {
      alert('Clipboard unavailable. Try Export JSON to download the file.');
    }
  };

  // --- Features table helpers ---
  const isNumber = (v: any) => typeof v === 'number' && Number.isFinite(v);
  const formatNum = (v: number) =>
    Math.abs(v) >= 1000 ? Math.round(v).toString()
      : Math.abs(v) >= 10 ? v.toFixed(2)
        : v.toFixed(3);

  const FeaturesTable = ({ item }: { item: PositionItem }) => {
    const feats = item.features ?? {};
    const entries = Object.entries(feats);
    if (!entries.length) return <div style={{ opacity: 0.7 }}>No features present.</div>;
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 10px',
        fontSize: 12, background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)', padding: 10, borderRadius: 8
      }}>
        {entries.map(([k, v]) => (
          <React.Fragment key={k}>
            <div style={{ opacity: 0.75 }}>{k}</div>
            <div style={{ fontWeight: 600 }}>
              {isNumber(v) ? formatNum(v as number) : typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v ?? '')}
            </div>
          </React.Fragment>
        ))}
      </div>
    );
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
          <button onClick={() => go(-1)} disabled={!hasItems} title="Prev (←)"
            style={{ padding: '6px 10px', borderRadius: 6, background: '#2a2a2a', color: '#eee', border: '1px solid #444' }}>◀</button>
          <button onClick={() => go(+1)} disabled={!hasItems} title="Next (→)"
            style={{ padding: '6px 10px', borderRadius: 6, background: '#2a2a2a', color: '#eee', border: '1px solid #444' }}>▶</button>
        </div>
      </div>

      {!hasItems ? (
        <div style={{ opacity: 0.8 }}>
          Click a dot to select, <b>Cmd/Ctrl-click</b> to add more.
          Tip: Shift-drag on the plot to box-select multiple.
        </div>
      ) : (
        <div onPointerDown={onPointerDown} onPointerUp={onPointerUp} style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontWeight: 600, flex: 1 }}>
              #{current!.id} — {current!.metadata?.prediction?.category} · score {typeof current!.metadata?.prediction?.score === 'number' ? current!.metadata!.prediction!.score!.toFixed(3) : 'n/a'}
            </div>
            {/* Export controls for THIS image */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={exportCurrent}
                title="Export this image's JSON"
                style={{ padding: '6px 10px', borderRadius: 6, background: '#2a2a2a', color: '#eee', border: '1px solid #444' }}
              >Export JSON</button>
              <button
                onClick={copyCurrent}
                title="Copy JSON to clipboard"
                style={{ padding: '6px 10px', borderRadius: 6, background: '#2a2a2a', color: '#eee', border: '1px solid #444' }}
              >Copy</button>
            </div>
          </div>

          {total > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {items.map((it, i) => (
                <button key={it.id} onClick={() => setIdx(i)} title={`Go to ${i + 1}`}
                  style={{
                    width: 22, height: 22, borderRadius: 999,
                    border: '1px solid #444', background: i === idx ? '#60a5fa' : '#2a2a2a',
                    color: i === idx ? '#000' : '#bbb', fontSize: 11
                  }}>
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

          <div style={{ fontWeight: 700, marginTop: 6 }}>Features</div>
          <FeaturesTable item={current!} />
        </div>
      )}
    </div>
  );
}

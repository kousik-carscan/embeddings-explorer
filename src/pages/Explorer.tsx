import React, { useMemo, useState } from 'react';
import { useData } from '../hooks/useData';
import Controls from '../components/Controls';
import FileUploader from '../components/FileUploader';
import ScatterPlot from '../components/ScatterPlot';
import MultiPreviewPanel from '../components/MultiPreviewPanel';
import type { PositionItem } from '../types';
import ColorLegend from '../components/ColorLegend';
import { useAuth } from '../auth';

export default function Explorer() {
  // Streaming-aware hook (small JSON -> loadFromFile, huge NDJSON -> loadFromFileStream)
  const { data, source, status: loadStatus, loadFromFile, loadFromFileStream } = useData(null);
  const { logout } = useAuth();

  // -----------------------------
  // 0) Base positions
  // -----------------------------
  const positions = useMemo<PositionItem[]>(() => data?.positions ?? [], [data?.positions]);

  // -----------------------------
  // 1) Add VIRTUAL cluster schemes for categorical fields
  //    so they behave like real cluster labels.
  //    Keys we add:
  //      __cat:category         -> metadata.prediction.category
  //      __feat:data_split      -> features.data_split
  //      __feat:eval_type       -> features.eval_type
  //      __feat:reflection      -> features.reflection (boolean -> "true"/"false")
  // -----------------------------
  const VIRTUAL_KEYS = [
    '__cat:category',
    '__feat:data_split',
    '__feat:eval_type',
    '__feat:reflection',
  ] as const;

  const positionsWithVirtual = useMemo<PositionItem[]>(() => {
    if (!positions.length) return positions;
    return positions.map((p) => {
      const cat = p.metadata?.prediction?.category;
      const ds = (p as any)?.features?.data_split;
      const et = (p as any)?.features?.eval_type;
      const refl = (p as any)?.features?.reflection;

      const extra: Record<string, any> = {};
      extra['__cat:category'] = cat ?? null;
      extra['__feat:data_split'] = ds ?? null;
      extra['__feat:eval_type'] = et ?? null;
      extra['__feat:reflection'] = typeof refl === 'boolean' ? String(refl) : (refl ?? null);

      return {
        ...p,
        cluster_labels: { ...(p.cluster_labels ?? {}), ...extra },
      };
    });
  }, [positions]);

  // Real cluster keys from data
  const realClusterKeys = useMemo<string[]>(
    () => (data?.cluster_labels ? Object.keys(data.cluster_labels) : []),
    [data?.cluster_labels]
  );

  // What appears in the “Cluster” dropdown (real + virtual)
  const clusterKeys = useMemo<string[]>(
    () => [...realClusterKeys, ...VIRTUAL_KEYS],
    [realClusterKeys]
  );

  // -----------------------------
  // 2) Color mode state
  // -----------------------------
  const [scheme, setScheme] = useState<string>(clusterKeys[0] ?? 'dbscan');
  const [colorMode, setColorMode] = useState<'cluster' | 'score'>(clusterKeys.length ? 'cluster' : 'score');
  const [pointSize, setPointSize] = useState(3);

  // Status coming from renderer (draw time / point count)
  const [drawStatus, setDrawStatus] = useState<string>('');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Multi-select
  const [selectedIdx, setSelectedIdx] = useState<number[]>([]);
  const [selectionShape, setSelectionShape] = useState<'rect' | 'circle'>('rect');

  // Keep scheme consistent if keys change
  React.useEffect(() => {
    if (!clusterKeys.length) { setScheme('dbscan'); setColorMode('score'); return; }
    if (!clusterKeys.includes(scheme)) setScheme(clusterKeys[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterKeys.join('|')]);

  // -----------------------------
  // 3) Filter by cluster (works for virtual keys too)
  // -----------------------------
  const [clusterFilter, setClusterFilter] = useState<string | number | null>(null);

  const filteredPositions = useMemo(() => {
    if (colorMode !== 'cluster' || !clusterFilter?.toString?.()) return positionsWithVirtual;
    return positionsWithVirtual.filter(
      p => String(p.cluster_labels?.[scheme]) === String(clusterFilter)
    );
  }, [positionsWithVirtual, colorMode, clusterFilter, scheme]);

  const availableClusterValues = useMemo(() => {
    if (!filteredPositions.length) return [];
    const s = new Set<string | number>();
    for (const p of filteredPositions) {
      const lab = p.cluster_labels?.[scheme];
      if (lab !== undefined && lab !== null) s.add(lab as any);
    }
    return Array.from(s);
  }, [filteredPositions, scheme]);

  const clusterDistribution = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of positionsWithVirtual) {
      const v = p.cluster_labels?.[scheme];
      const key = v == null ? '(null)' : String(v);
      m.set(key, (m.get(key) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [positionsWithVirtual, scheme]);

  // -----------------------------
  // 4) “Color by score” also supports numeric features
  //    (width, height, area, aspect_ratio) without touching ScatterPlot:
  //    We normalize the feature to [0,1] and override prediction.score in a
  //    derived positions array we pass to the plot.
  // -----------------------------
  const numericFeatureKeys = useMemo(() => {
    const sample = positions[0];
    return Object.keys(sample?.features ?? {}).filter(
      k => typeof (sample!.features as any)?.[k] === 'number'
    );
  }, [positions]);

  const [scoreSource, setScoreSource] =
    useState<'prediction.score' | string>('prediction.score');

  const [fMin, fMax] = useMemo<[number, number]>(() => {
    if (scoreSource === 'prediction.score') return [0, 1];
    let mn = +Infinity, mx = -Infinity;
    for (const p of filteredPositions) {
      const v = Number((p.features as any)?.[scoreSource]);
      if (Number.isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; }
    }
    if (!Number.isFinite(mn) || !Number.isFinite(mx) || mn === mx) return [0, 1];
    return [mn, mx];
  }, [filteredPositions, scoreSource]);

  const positionsForPlot = useMemo<PositionItem[]>(() => {
    if (colorMode !== 'score' || scoreSource === 'prediction.score') return filteredPositions;
    const [mn, mx] = [fMin, fMax];
    const norm = (v: number) => {
      if (!Number.isFinite(v)) return 0;
      if (mx === mn) return 0;
      const t = (v - mn) / (mx - mn);
      return Math.max(0, Math.min(1, t));
    };
    return filteredPositions.map((p) => {
      const v = Number((p.features as any)?.[scoreSource]);
      const t = norm(v);
      const pred = { ...(p.metadata?.prediction ?? {}), score: t } as any;
      const md = { ...(p.metadata ?? {}), prediction: pred } as any;
      return { ...p, metadata: md };
    });
  }, [filteredPositions, colorMode, scoreSource, fMin, fMax]);

  // -----------------------------
  // 5) Selection handlers (unchanged)
  // -----------------------------
  const handleSelect = (idx: number | null, opts?: { append?: boolean; range?: boolean }) => {
    const append = !!opts?.append;
    if (idx == null) {
      if (!append) setSelectedIdx([]);
      return;
    }
    if (!append) { setSelectedIdx([idx]); return; }
    setSelectedIdx(prev => {
      const without = prev.filter(i => i !== idx);
      return [...without, idx];
    });
  };

  const handleBoxSelect = (indices: number[], opts?: { append?: boolean }) => {
    if (!indices.length) return;
    const append = !!opts?.append;
    if (!append) {
      setSelectedIdx(indices);
    } else {
      setSelectedIdx(prev => {
        const s = new Set(prev);
        const merged = [...prev];
        for (const i of indices) if (!s.has(i)) merged.push(i);
        return merged;
      });
    }
  };

  const selectedItems = useMemo(
    () => selectedIdx.slice().reverse().map(i => positionsForPlot[i]).filter(Boolean),
    [selectedIdx, positionsForPlot]
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0a', color: '#e5e5e5' }}>
      <Controls
        name={data?.name} method={data?.method}
        clusterKeys={clusterKeys}                // real + virtual
        scheme={scheme} setScheme={setScheme}
        colorMode={colorMode} setColorMode={setColorMode}
        pointSize={pointSize} setPointSize={setPointSize}
        status={`${loadStatus}${drawStatus ? ` · ${drawStatus}` : ''}${source ? ` · source: ${source}` : ''}`}
        disabledCluster={!clusterKeys.length}
        extra={(
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <FileUploader onFile={loadFromFile} onFileStream={loadFromFileStream} />
              <button
                onClick={() => setSelectedIdx([])}
                style={{ padding: '6px 10px', borderRadius: 6, background: '#2a2a2a', color: '#eee', border: '1px solid #444' }}
              >
                Clear selection
              </button>
              <button
                onClick={logout}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: '#7f1d1d',
                  color: '#fff',
                  border: '1px solid #b91c1c'
                }}
                title="Sign out and return to login"
              >
                Logout
              </button>
            </div>

            {/* When "score" is chosen, let user pick the source: prediction.score or a numeric feature */}
            {colorMode === 'score' && (
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 6, alignItems: 'center' }}>
                <label>Score source</label>
                <select value={scoreSource} onChange={(e) => setScoreSource(e.target.value as any)}>
                  <option value="prediction.score">prediction.score</option>
                  {numericFeatureKeys.map(k => (
                    <option key={k} value={k}>feature · {k}</option>
                  ))}
                </select>
                {scoreSource !== 'prediction.score' && (
                  <div style={{ gridColumn: '1 / span 2', fontSize: 11, opacity: 0.8 }}>
                    Normalized to [0,1] · min {fMin.toFixed(3)} · max {fMax.toFixed(3)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        clusterFilter={clusterFilter}
        setClusterFilter={setClusterFilter}
        availableClusterValues={availableClusterValues}
        selectionShape={selectionShape}
        setSelectionShape={setSelectionShape}
        clusterDistribution={clusterDistribution}
      />

      <ScatterPlot
        positions={positionsForPlot}
        scheme={scheme}
        colorMode={colorMode}
        pointSize={pointSize}
        setStatus={setDrawStatus}
        onHover={(i) => setHoverIdx(i)}
        onSelect={handleSelect}
        onBoxSelect={handleBoxSelect}
        selectionShape={selectionShape}
      />

      {/* Legend (cluster values reflect virtual schemes too) */}
      <ColorLegend mode={colorMode as any} scheme={scheme} clusterValues={availableClusterValues} />

      <MultiPreviewPanel data={data ?? null} items={selectedItems} hoverIdx={hoverIdx} />
    </div>
  );
}

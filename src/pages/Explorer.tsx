import React, { useMemo, useState } from 'react';
import { useData } from '../hooks/useData';
import Controls from '../components/Controls';
import FileUploader from '../components/FileUploader';
import ScatterPlot from '../components/ScatterPlot';
import MultiPreviewPanel from '../components/MultiPreviewPanel';
import type { PositionItem } from '../types';
import ColorLegend from '../components/ColorLegend';

export default function Explorer() {
  const { data, source, loadFromFile } = useData(null);
  const positions = useMemo<PositionItem[]>(() => data?.positions ?? [], [data?.positions]);
  const clusterKeys = useMemo<string[]>(
    () => (data?.cluster_labels ? Object.keys(data.cluster_labels) : []),
    [data?.cluster_labels]
  );

  const [scheme, setScheme] = useState<string>(clusterKeys[0] ?? 'dbscan');
  const [colorMode, setColorMode] = useState<'cluster' | 'score'>(clusterKeys.length ? 'cluster' : 'score');
  const [pointSize, setPointSize] = useState(3);
  const [status, setStatus] = useState<string>('');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Multi-select
  const [selectedIdx, setSelectedIdx] = useState<number[]>([]);
  const [selectionShape, setSelectionShape] = useState<'rect' | 'circle'>('rect');

  // Optional cluster filter
  const [clusterFilter, setClusterFilter] = useState<string | number | null>(null);
  const filteredPositions = useMemo(() => {
    if (colorMode !== 'cluster' || !clusterFilter?.toString?.()) return positions;
    return positions.filter(p => String(p.cluster_labels?.[scheme]) === String(clusterFilter));
  }, [positions, colorMode, clusterFilter, scheme]);

  const availableClusterValues = useMemo(() => {
    if (!positions.length) return [];
    const s = new Set<string | number>();
    for (const p of positions) {
      const lab = p.cluster_labels?.[scheme];
      if (lab !== undefined && lab !== null) s.add(lab as any);
    }
    return Array.from(s);
  }, [positions, scheme]);

  const clusterDistribution = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of positions) {
      const v = p.cluster_labels?.[scheme];
      const key = v == null ? '(null)' : String(v);
      m.set(key, (m.get(key) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [positions, scheme]);

  React.useEffect(() => {
    if (!clusterKeys.length) { setScheme('dbscan'); setColorMode('score'); return; }
    if (!clusterKeys.includes(scheme)) setScheme(clusterKeys[0]);
  }, [clusterKeys.join('|')]);

  // Point click from scatter
  const handleSelect = (idx: number | null, opts?: { append?: boolean; range?: boolean }) => {
    const append = !!opts?.append;
    if (idx == null) {
      if (!append) setSelectedIdx([]);
      return;
    }
    if (!append) { setSelectedIdx([idx]); return; }
    // move to most-recent at the end
    setSelectedIdx(prev => {
      const without = prev.filter(i => i !== idx);
      return [...without, idx];
    });
  };

  // Marquee result from scatter
  const handleBoxSelect = (indices: number[], opts?: { append?: boolean }) => {
    if (!indices.length) return;
    const append = !!opts?.append;
    if (!append) {
      setSelectedIdx(indices); // replace
    } else {
      setSelectedIdx(prev => {
        const s = new Set(prev);
        // preserve order: first existing, then new in order
        const merged = [...prev];
        for (const i of indices) if (!s.has(i)) merged.push(i);
        return merged;
      });
    }
  };

  const selectedItems = useMemo(
    () => selectedIdx.slice().reverse().map(i => filteredPositions[i]).filter(Boolean),
    [selectedIdx, filteredPositions]
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0a', color: '#e5e5e5' }}>
      <Controls
        name={data?.name} method={data?.method}
        clusterKeys={clusterKeys} scheme={scheme} setScheme={setScheme}
        colorMode={colorMode} setColorMode={setColorMode}
        pointSize={pointSize} setPointSize={setPointSize}
        status={`${status}${source ? ` · source: ${source}` : ''}`}
        disabledCluster={!clusterKeys.length}
        extra={(
          <div style={{ display: 'flex', gap: 8 }}>
            <FileUploader onFile={loadFromFile} />
            <button
              onClick={() => setSelectedIdx([])}
              style={{ padding: '6px 10px', borderRadius: 6, background: '#2a2a2a', color: '#eee', border: '1px solid #444' }}
            >
              Clear selection
            </button>
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
        positions={filteredPositions}
        scheme={scheme}
        colorMode={colorMode}
        pointSize={pointSize}
        setStatus={setStatus}
        onHover={(i) => setHoverIdx(i)}
        onSelect={handleSelect}
        onBoxSelect={handleBoxSelect}            // NEW
        selectionShape={selectionShape}          // NEW
      />

      {/* Bottom-right legend */}
      <ColorLegend
        mode={colorMode as any}
        scheme={scheme}
        clusterValues={availableClusterValues}
      />

      <MultiPreviewPanel data={data ?? null} items={selectedItems} hoverIdx={hoverIdx} />
    </div>
  );
}

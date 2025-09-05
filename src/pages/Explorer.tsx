import React, { useMemo, useState } from 'react';
import { useData } from '../hooks/useData';
import Controls from '../components/Controls';
import FileUploader from '../components/FileUploader';
import ScatterPlot from '../components/ScatterPlot';
import MultiPreviewPanel from '../components/MultiPreviewPanel';
import type { PositionItem } from '../types';

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

  // NEW: multi-select
  const [selectedIdx, setSelectedIdx] = useState<number[]>([]);

  // optional: cluster filter you already had (keep or remove as you like)
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

  // keep scheme consistent
  React.useEffect(() => {
    if (!clusterKeys.length) { setScheme('dbscan'); setColorMode('score'); return; }
    if (!clusterKeys.includes(scheme)) setScheme(clusterKeys[0]);
  }, [clusterKeys.join('|')]);

  // handle click selection from ScatterPlot
  // const handleSelect = (idx: number | null, opts?: { append?: boolean; range?: boolean }) => {
  //   const append = !!opts?.append;
  //   if (idx == null) {
  //     if (!append) setSelectedIdx([]); // clear on empty click (unless append)
  //     return;
  //   }
  //   if (!append) {
  //     setSelectedIdx([idx]);
  //     return;
  //   }
  //   // toggle
  //   setSelectedIdx(prev => {
  //     if (prev.includes(idx)) return prev.filter(i => i !== idx);
  //     return [...prev, idx];
  //   });
  // };

  // handle click selection from ScatterPlot
const handleSelect = (idx: number | null, opts?: { append?: boolean; range?: boolean }) => {
  const append = !!opts?.append;
  if (idx == null) {
    if (!append) setSelectedIdx([]); // clear on empty click (unless append)
    return;
  }
  if (!append) {
    setSelectedIdx([idx]); // replace selection
    return;
  }
  // append/toggle; ensure the clicked one becomes "most recent" (at the end)
  setSelectedIdx(prev => {
    const without = prev.filter(i => i !== idx);
    return [...without, idx];
  });
};


  // const selectedItems = useMemo(() => selectedIdx.map(i => filteredPositions[i]).filter(Boolean), [selectedIdx, filteredPositions]);
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
              title="Clear selected images"
            >
              Clear selection
            </button>
          </div>
        )}

        clusterFilter={clusterFilter}
        setClusterFilter={setClusterFilter}
        availableClusterValues={availableClusterValues}
      />

      <ScatterPlot
        positions={filteredPositions}
        scheme={scheme}
        colorMode={colorMode}
        pointSize={pointSize}
        setStatus={setStatus}
        onHover={(i) => setHoverIdx(i)}
        onSelect={handleSelect}
      />

      <MultiPreviewPanel data={data ?? null} items={selectedItems}  hoverIdx={hoverIdx} />
    </div>
  );
}

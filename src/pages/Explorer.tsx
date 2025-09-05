import React, { useMemo, useState } from 'react';
import { useData } from '../hooks/useData';
import Controls from '../components/Controls';
import FileUploader from '../components/FileUploader';
import ScatterPlot from '../components/ScatterPlot';
import ImagePreview from '../components/ImagePreview';
import type { PositionItem } from '../types';

export default function Explorer() {
  const { data, source, loadFromFile } = useData(null);
  const positions = useMemo<PositionItem[]>(() => data?.positions ?? [], [data?.positions]);
  const clusterKeys = useMemo<string[]>(() => data?.cluster_labels ? Object.keys(data.cluster_labels) : [], [data?.cluster_labels]);

  const [scheme, setScheme] = useState<string>(clusterKeys[0] ?? 'dbscan');
  const [colorMode, setColorMode] = useState<'cluster' | 'score'>(clusterKeys.length ? 'cluster' : 'score');
  const [pointSize, setPointSize] = useState(3);
  const [status, setStatus] = useState<string>('');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);


  // new state
  const [clusterFilter, setClusterFilter] = useState<string | number | null>(null);

  // compute filtered positions (when color by cluster and a filter is chosen)
  // const filteredPositions = useMemo(() => {
  //   if (colorMode !== 'cluster' || !clusterFilter?.toString?.()) return positions;
  //   return positions.filter(p => String(p.cluster_labels?.[scheme]) === String(clusterFilter));
  // }, [positions, colorMode, clusterFilter, scheme]);

  // compute filtered positions (when color by cluster and a filter is chosen)
  const filteredPositions = useMemo(() => {
    if (colorMode !== 'cluster' || clusterFilter == null) return positions;

    const res = positions.filter(
      (p) => String(p.cluster_labels?.[scheme]) === String(clusterFilter)
    );

    console.log(
      'scheme:', scheme,
      'clusterFilter:', clusterFilter,
      'matching points:', res.length,
      'first match:', res[0]
    );

    return res;
  }, [positions, colorMode, clusterFilter, scheme]);


  // available cluster values
  const availableClusterValues = useMemo(() => {
    if (!positions.length) return [];
    const s = new Set<string | number>();
    for (const p of positions) {
      const lab = p.cluster_labels?.[scheme];
      if (lab !== undefined && lab !== null) s.add(lab as any);
    }
    const arr = Array.from(s);

    console.log(
      'scheme:', scheme,
      'unique cluster values:', arr.slice(0, 10)
    );

    return arr;
  }, [positions, scheme]);

  // const availableClusterValues = useMemo(() => {
  //   if (!positions.length) return [];
  //   const s = new Set<string | number>();
  //   for (const p of positions) {
  //     const lab = p.cluster_labels?.[scheme];
  //     if (lab !== undefined && lab !== null) s.add(lab as any);
  //   }
  //   return Array.from(s);
  // }, [positions, scheme]);



  // below your other useMemos
  const clusterDistribution = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of positions) {
      const v = p.cluster_labels?.[scheme];
      const key = v === undefined || v === null ? '(null)' : String(v);
      m.set(key, (m.get(key) || 0) + 1);
    }
    // sort by count desc
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [positions, scheme]);



  // keep scheme consistent if cluster keys change
  React.useEffect(() => {
    if (!clusterKeys.length) { setScheme('dbscan'); setColorMode('score'); return; }
    if (!clusterKeys.includes(scheme)) setScheme(clusterKeys[0]);
  }, [clusterKeys.join('|')]);

  const active = activeIdx != null && activeIdx >= 0 && activeIdx < positions.length ? positions[activeIdx] : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0a', color: '#e5e5e5' }}>
      <Controls
        name={data?.name} method={data?.method}
        clusterKeys={clusterKeys} scheme={scheme} setScheme={setScheme}
        colorMode={colorMode} setColorMode={setColorMode}
        pointSize={pointSize} setPointSize={setPointSize}
        status={`${status}${source ? ` · source: ${source}` : ''}`}
        disabledCluster={!clusterKeys.length}
        extra={<FileUploader onFile={loadFromFile} />}

        clusterFilter={clusterFilter}
        setClusterFilter={setClusterFilter}
        availableClusterValues={availableClusterValues}

        clusterDistribution={clusterDistribution}

      />

      {/* <ScatterPlot
        positions={positions}
        scheme={scheme}
        colorMode={colorMode}
        pointSize={pointSize}
        setStatus={setStatus}
        onHover={(i) => setHoverIdx(i)}
        onSelect={() => setActiveIdx(hoverIdx)}
      /> */}


      <ScatterPlot
        positions={filteredPositions}
        scheme={scheme}
        colorMode={colorMode}
        pointSize={pointSize}
        setStatus={setStatus}
        onHover={(i) => setHoverIdx(i)}
        onSelect={(i) => setActiveIdx(i ?? hoverIdx ?? null)}
      />

      <ImagePreview data={data ?? null} active={active} scheme={scheme} />
    </div>
  );
}

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
      />

      <ScatterPlot
        positions={positions}
        scheme={scheme}
        colorMode={colorMode}
        pointSize={pointSize}
        setStatus={setStatus}
        onHover={(i) => setHoverIdx(i)}
        onSelect={() => setActiveIdx(hoverIdx)}
      />

      <ImagePreview data={data ?? null} active={active} scheme={scheme} />
    </div>
  );
}

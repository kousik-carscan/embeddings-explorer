import React from 'react';

type Props = {
  name?: string;
  method?: string;
  clusterKeys: string[];
  scheme: string;
  setScheme: (k: string) => void;
  colorMode: 'cluster' | 'score';
  setColorMode: (m: 'cluster' | 'score') => void;
  pointSize: number;
  setPointSize: (n: number) => void;
  status: string;
  footerRight?: React.ReactNode;
  disabledCluster: boolean;
  extra?: React.ReactNode; // e.g., FileUploader
};

export default function Controls({
  name, method, clusterKeys, scheme, setScheme,
  colorMode, setColorMode, pointSize, setPointSize,
  status, footerRight, disabledCluster, extra
}: Props) {
  return (
    <div style={{
      position: 'absolute', left: 12, top: 12, zIndex: 1000,
      padding: 12, borderRadius: 12, background: 'rgba(20,20,20,0.85)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)', fontSize: 12, width: 380
    }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>
        {name ?? '(no name)'} — {method ?? '(no method)'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 6, alignItems: 'center' }}>
        <label>Cluster</label>
        <select value={scheme} onChange={(e) => setScheme(e.target.value)} disabled={disabledCluster}>
          {disabledCluster
            ? <option value="dbscan">(no clusters)</option>
            : clusterKeys.map(k => <option key={k} value={k}>{k}</option>)}
        </select>

        <label>Color by</label>
        <select value={colorMode} onChange={(e) => setColorMode(e.target.value as any)}>
          <option value="cluster" disabled={disabledCluster}>cluster label</option>
          <option value="score">score</option>
        </select>

        <label>Point size</label>
        <input
          type="range" min={1} max={8} step={0.5}
          value={pointSize} onChange={(e) => setPointSize(parseFloat(e.target.value))}
        />
      </div>

      <div style={{ display: 'flex', marginTop: 8, gap: 8, alignItems: 'center' }}>
        <div style={{ opacity: 0.8, flex: 1 }}>{status}</div>
        {footerRight}
      </div>

      <div style={{ marginTop: 10 }}>{extra}</div>
    </div>
  );
}

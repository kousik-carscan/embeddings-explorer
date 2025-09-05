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

  // NEW: you already declared these in Props, now actually receive them
  clusterFilter?: string | number | null;
  setClusterFilter?: (v: string | number | null) => void;
  availableClusterValues?: Array<string | number>;

  clusterDistribution?: Array<[string, number]>;

};

export default function Controls({
  name, method, clusterKeys, scheme, setScheme,
  colorMode, setColorMode, pointSize, setPointSize,
  status, footerRight, disabledCluster, extra,
  clusterFilter, setClusterFilter, availableClusterValues, clusterDistribution
}: Props) {
  // helper: coerce filter value back to number if it looks numeric
  const coerce = (v: string): string | number => {
    if (v === '') return '';
    const asNum = Number(v);
    return Number.isFinite(asNum) && String(asNum) === v ? asNum : v;
  };

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
        {/* Cluster scheme selector (RESTORED) */}
        <label>Cluster</label>
        <select
          value={scheme}
          onChange={(e) => {
            const v = e.target.value;
            setScheme(v);
            // make the change visible immediately
            setColorMode('cluster');
            // clear filter because labels differ per scheme
            setClusterFilter?.(null);
          }}
          disabled={disabledCluster}
        >
          {disabledCluster ? (
            <option value="dbscan">(no clusters)</option>
          ) : (
            clusterKeys.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))
          )}
        </select>

        <label>Color by</label>
        <select
          value={colorMode}
          onChange={(e) => {
            const m = e.target.value as 'cluster' | 'score';
            setColorMode(m);
            // optional: when leaving cluster mode, clear filter so it doesn't “stick”
            if (m !== 'cluster') setClusterFilter?.(null);
          }}
        >
          <option value="cluster" disabled={disabledCluster}>cluster label</option>
          <option value="score">score</option>
        </select>

        {/* Cluster value filter (only when coloring by clusters) */}
        {colorMode === 'cluster' && (
          <>
            <label>Filter cluster</label>
            <select
              value={clusterFilter ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') setClusterFilter?.(null);
                else setClusterFilter?.(coerce(raw));
              }}
              disabled={disabledCluster}
            >
              <option value="">(all)</option>
              {(availableClusterValues ?? []).map((v) => (
                <option key={String(v)} value={String(v)}>
                  {String(v)}
                </option>
              ))}
            </select>
          </>
        )}


        {colorMode === 'cluster' && (clusterDistribution?.length ?? 0) > 0 && (
          <>
            <div style={{ gridColumn: '1 / -1', marginTop: 6, fontWeight: 600 }}>
              Cluster counts
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, maxHeight: 140, overflow: 'auto' }}>
              {clusterDistribution!.map(([lab, cnt]) => (
                <div key={lab} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.06)', padding: '4px 8px', borderRadius: 6 }}>
                  <span>{lab}</span>
                  <span style={{ opacity: 0.8 }}>{cnt}</span>
                </div>
              ))}
            </div>
          </>
        )}




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

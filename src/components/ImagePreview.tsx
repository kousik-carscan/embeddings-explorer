// import React from 'react';
import type { Dataset, PositionItem } from '../types';

type Props = {
  data: Dataset | null;
  active: PositionItem | null;
  scheme: string;
};

export default function ImagePreview({ data, active, scheme }: Props) {
  return (
    <div style={{
      position: 'absolute', right: 12, top: 12, zIndex: 1000,
      width: 380, maxHeight: '95vh', overflow: 'auto',
      background: 'rgba(20,20,20,0.85)', padding: 12, borderRadius: 12, fontSize: 12
    }}>
      {active ? (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Selected #{active.id}</div>
          <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 8 }}>
            <div><b>image</b>: {active.metadata?.image_name}</div>
            <div><b>path</b>: <code style={{ fontSize: 11 }}>{active.metadata?.image_path}</code></div>
            <div><b>cluster</b>: {scheme} = {active.cluster_labels?.[scheme]}</div>
            <div><b>score</b>: {active.metadata?.prediction?.score?.toFixed(3)}</div>
            <div><b>bbox</b>: [{(active.metadata?.prediction?.bbox ?? []).join(', ')}]</div>
            <div><b>eval</b>: {active.features?.eval_type} — {active.metadata?.prediction?.category}</div>
          </div>

          <div style={{ fontWeight: 600, marginTop: 8, marginBottom: 6 }}>
            Annotations for image_id {active.metadata?.image_id}
          </div>
          <div>
            {(data?.annotations?.[String(active.metadata?.image_id)] ?? []).map((ann, i) => (
              <div key={i} style={{ fontSize: 12, opacity: 0.9 }}>
                #{ann.id} {ann.category} — [{ann.bbox.join(', ')}]
              </div>
            ))}
            {!((data?.annotations?.[String(active.metadata?.image_id)] ?? []).length) && (
              <div style={{ fontSize: 12, opacity: 0.7 }}>No annotations.</div>
            )}
          </div>

          {active.metadata?.image_path?.startsWith('http') && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Preview</div>
              <img
                src={active.metadata.image_path}
                alt={active.metadata.image_name}
                style={{ maxWidth: '100%', borderRadius: 8 }}
              />
            </div>
          )}
        </div>
      ) : (
        <div style={{ opacity: 0.8 }}>No selection yet…</div>
      )}
    </div>
  );
}

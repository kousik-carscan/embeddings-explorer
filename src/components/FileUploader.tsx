// import React, { useRef, useState } from 'react';
import { useRef, useState } from 'react';

type Props = {
  onFile: (file: File) => Promise<void> | void;
};

export default function FileUploader({ onFile }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      style={{
        padding: 8,
        borderRadius: 8,
        background: dragOver ? 'rgba(50,200,120,0.12)' : 'rgba(255,255,255,0.04)',
      }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setDragOver(false);
        const f = e.dataTransfer?.files?.[0];
        if (f) onFile(f);
      }}
    >
      <button
        onClick={() => inputRef.current?.click()}
        style={{ padding: '4px 8px', borderRadius: 6 }}
      >
        Upload JSON
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) onFile(f); }}
      />
      <div style={{ fontSize: 11, opacity: 0.8, marginTop: 6 }}>
        Tip: drag & drop a <code>.json</code> file here, or place one at <code>/public/data.json</code>.
      </div>
    </div>
  );
}

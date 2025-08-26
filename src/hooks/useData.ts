import { useEffect, useState } from 'react';
import { parseDataset } from '../utils/parseData';
import type { Dataset } from '../types';

export function useData(initial?: Dataset | null) {
  const [data, setData] = useState<Dataset | null>(initial ?? null);
  const [source, setSource] = useState<string>('');

  // Attempt to auto-load if nothing passed
  useEffect(() => {
    if (data) return;
    let cancelled = false;

    (async () => {
      // window global first
      if (window.__EMBEDDINGS_DATA__) {
        if (!cancelled) {
          setData(parseDataset(window.__EMBEDDINGS_DATA__));
          setSource('window.__EMBEDDINGS_DATA__');
        }
        return;
      }
      // then /public/data.json -> /public/sample_data.json
      const tryFetch = async (url: string) => {
        try {
          const res = await fetch(url);
          if (res.ok) return await res.json();
        } catch { /* ignore */ }
        return null;
      };
      const a = await tryFetch('/data.json');
      if (!cancelled && a) { setData(parseDataset(a)); setSource('/data.json'); return; }
      const b = await tryFetch('/sample_data.json');
      if (!cancelled && b) { setData(parseDataset(b)); setSource('/sample_data.json'); return; }
    })();

    return () => { cancelled = true; };
  }, [data]);

  // Local file upload
  async function loadFromFile(file: File) {
    const text = await file.text();
    const json = JSON.parse(text);
    const parsed = parseDataset(json);
    setData(parsed);
    setSource(`upload:${file.name}`);
  }

  return { data, setData, source, loadFromFile };
}

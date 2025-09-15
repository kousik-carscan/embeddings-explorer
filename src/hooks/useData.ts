import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseDataset } from '../utils/parseData';
import type { Dataset, PositionItem } from '../types';

type DataState = Dataset | null;

export function useData(initial?: Dataset | null) {
  const [data, setData] = useState<DataState>(initial ?? null);
  const [source, setSource] = useState<string>('');
  const [loadedCount, setLoadedCount] = useState<number>(0);
  const totalCountRef = useRef(0);

  // -------- Auto-load (unchanged) --------
  useEffect(() => {
    if (data) return;
    let cancelled = false;

    (async () => {
      if ((window as any).__EMBEDDINGS_DATA__) {
        if (!cancelled) {
          setData(parseDataset((window as any).__EMBEDDINGS_DATA__));
          setSource('window.__EMBEDDINGS_DATA__');
        }
        return;
      }
      const tryFetch = async (url: string) => {
        try {
          const res = await fetch(url);
          if (res.ok) return await res.json();
        } catch { }
        return null;
      };
      const a = await tryFetch('/data.json');
      if (!cancelled && a) { setData(parseDataset(a)); setSource('/data.json'); return; }
      const b = await tryFetch('/sample_data.json');
      if (!cancelled && b) { setData(parseDataset(b)); setSource('/sample_data.json'); return; }
    })();

    return () => { cancelled = true; };
  }, [data]);

  // -------- Legacy loader: small JSON array/object --------
  const loadFromFile = useCallback(async (file: File) => {
    const text = await file.text();
    const json = JSON.parse(text);
    const parsed = parseDataset(json);
    setData(parsed);
    setSource(`upload:${file.name}`);
    setLoadedCount(parsed?.positions?.length ?? 0);
  }, []);

  // -------- Streaming loader: NDJSON/JSONL in batches (off main thread) --------
  const loadFromFileStream = useCallback((file: File) => {
    setSource(`stream:${file.name}`);
    totalCountRef.current = 0;

    // Seed a minimal dataset so the app renders immediately.
    setData({
      name: file.name,
      method: 'stream',
      positions: [],
      cluster_labels: {}, // keep shape compatible with your UI
    } as unknown as Dataset);

    // instantiate worker
    const worker = new Worker(new URL('/ingest.worker.js', import.meta.url), { type: 'module' });

    // Cap how much we keep in memory for rendering (tune as needed)
    const MAX_IN_MEMORY = 1_000_000; // 1M points

    worker.onmessage = (e: MessageEvent) => {
      const { type, rows, error } = (e.data || {}) as {
        type: 'batch' | 'done' | 'error',
        rows?: PositionItem[],
        error?: string
      };

      if (type === 'error') {
        console.warn('Worker parse error:', error);
        return;
      }

      if (type === 'batch' && rows && rows.length) {
        totalCountRef.current += rows.length;

        setData(prev => {
          // If user navigated away or prev is null, start fresh
          const prevPositions = prev?.positions ?? [];
          // honor memory cap; you can persist extra rows to IndexedDB later if needed
          if (prevPositions.length >= MAX_IN_MEMORY) return prev as Dataset;

          const room = Math.max(0, MAX_IN_MEMORY - prevPositions.length);
          const take = Math.min(room, rows.length);
          const nextPositions = take ? prevPositions.concat(rows.slice(0, take)) : prevPositions;

          return {
            ...(prev ?? { name: file.name, method: 'stream' }),
            positions: nextPositions,
            cluster_labels: (prev as any)?.cluster_labels ?? {},
          } as Dataset;
        });

        setLoadedCount(totalCountRef.current);
        return;
      }

      if (type === 'done') {
        worker.terminate();
      }
    };

    worker.postMessage({ file, batchSize: 50_000 });
  }, []);

  const status = useMemo(
    () => (loadedCount ? `loaded ${loadedCount.toLocaleString()} rows` : ''),
    [loadedCount]
  );

  return { data, setData, source, status, loadFromFile, loadFromFileStream };
}

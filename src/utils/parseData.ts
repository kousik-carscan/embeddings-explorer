import type { Dataset } from '../types';

export function parseDataset(input: unknown): Dataset {
  if (!input || typeof input !== 'object') {
    throw new Error('JSON root must be an object');
  }
  const obj = input as any;
  if (!Array.isArray(obj.positions)) {
    throw new Error('JSON must have a positions[] array');
  }
  // Basic normalization
  obj.cluster_labels ||= {};
  obj.annotations ||= {};
  obj.name ||= '(unnamed)';
  obj.method ||= '(unknown)';
  return obj as Dataset;
}

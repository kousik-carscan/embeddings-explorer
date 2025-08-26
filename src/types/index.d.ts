export type ClusterSchemeKey = string;

export interface PredictionMeta {
  pred_id: number;
  model_name: string;
  category: string;
  score: number;
  bbox: [number, number, number, number];
}

export interface PositionItem {
  id: number;
  x: number;
  y: number;
  cluster_labels: Record<ClusterSchemeKey, number>;
  metadata: {
    image_id: number;
    image_name: string;
    image_path: string;
    assessment_uuid: string;
    prediction: PredictionMeta;
  };
  features: {
    data_split: string;
    reflection: boolean;
    eval_type: string;
    width: number;
    height: number;
    area: number;
    aspect_ratio: number;
    entropy: number;
    blur_index_sobel: number;
    darkness_index: number;
    dynamic_range_p99_p01: number;
    edge_density: number;
    colorfulness_hs: number;
  };
}

export interface Dataset {
  name: string;
  method: string;
  cluster_labels?: Record<ClusterSchemeKey, number[]>;
  configs?: any;
  categories?: string[];
  description?: string;
  positions: PositionItem[];
  annotations?: Record<string, Array<{ id: number; category: string; bbox: [number, number, number, number] }>>;
}

declare global {
  interface Window { __EMBEDDINGS_DATA__?: Dataset }
}

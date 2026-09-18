export type Severity = 'ERROR' | 'WARNING' | 'INFO';

export type MeasureType =
  | 'FORMAT'        // форматная согласованность
  | 'TOPOLOGY'      // топологическая согласованность
  | 'COMPLETENESS'  // полнота атрибутов
  | 'DOMAIN'        // доменная согласованность
  | 'TEMPORAL';     // актуальность

export interface MeasureParams {
  requiredAttributes?: string;   // "a,b,c" — пусто = авто (все атрибуты)
  attribute?: string;            // для DOMAIN
  allowedValues?: string;        // "v1,v2,v3" — для DOMAIN
  dateAttribute?: string;        // для TEMPORAL
  maxAgeDays?: number;           // для TEMPORAL
  toleranceMeters?: number;      // для TOPOLOGY (дубликаты/перекрытия)
  sliverCompactness?: number;    // для TOPOLOGY (порог компактности)
}

export interface MeasureConfig {
  id: string;
  type: MeasureType;
  name: string;
  description: string;
  enabled: boolean;
  threshold: number;   // максимально допустимый % нарушений
  unit: string;
  weight: number;      // вес в итоговой оценке
  params: MeasureParams;
}

export interface Violation {
  type: string;
  severity: Severity;
  description: string;
  featureId?: string;
  location?: [number, number];
}

export interface MeasureResult {
  measureId: string;
  name: string;
  type: MeasureType;
  value: number;         // % нарушений
  threshold: number;
  unit: string;
  isConformant: boolean;
  checkedCount: number;
  violations: Violation[];
  note?: string;
}

export interface Dataset {
  id: string;
  name: string;
  featureCount: number;
  format: 'GEOJSON' | 'POSTGIS';
  uploadTime: string;
}

export interface Version {
  id: string;
  datasetId: string;
  versionNumber: number;
  uploadTime: string;
  recordCount: number;
  overallScore: number;
  results: MeasureResult[];
}

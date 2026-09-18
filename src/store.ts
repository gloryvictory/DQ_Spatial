import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type Feature from 'ol/Feature';
import { runAssessment, buildSeverity } from './engine';
import type { Dataset, MeasureConfig, MeasureResult, Severity, Version } from './types';

export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const DEFAULT_MEASURES: MeasureConfig[] = [
  { id: 'format', type: 'FORMAT', name: 'Форматная согласованность', description: 'Пустые/некорректные геометрии, нулевые площади и длины, NaN-координаты', enabled: true, threshold: 0, unit: '% объектов', weight: 1.2, params: {} },
  { id: 'topology', type: 'TOPOLOGY', name: 'Топологическая согласованность', description: 'Дубликаты, самопересечения, перекрытия, узкие полигоны (slivers)', enabled: true, threshold: 5, unit: '% объектов', weight: 1.5, params: { toleranceMeters: 1, sliverCompactness: 0.05 } },
  { id: 'completeness', type: 'COMPLETENESS', name: 'Полнота атрибутов', description: 'Доля пустых значений атрибутов (обязательные или все)', enabled: true, threshold: 5, unit: '% пропусков', weight: 1.2, params: { requiredAttributes: '' } },
  { id: 'domain', type: 'DOMAIN', name: 'Доменная согласованность', description: 'Значения атрибута вне допустимого списка', enabled: false, threshold: 5, unit: '% объектов', weight: 1, params: { attribute: '', allowedValues: '' } },
  { id: 'temporal', type: 'TEMPORAL', name: 'Актуальность (временное качество)', description: 'Объекты, обновлённые позже допустимого срока', enabled: false, threshold: 10, unit: '% объектов', weight: 1, params: { dateAttribute: '', maxAgeDays: 365 } },
];

interface GeoStore {
  datasets: Dataset[];
  selectedId: string | null;
  featuresMap: Record<string, Feature[]>;
  features: Feature[];
  measures: MeasureConfig[];
  results: MeasureResult[] | null;
  overallScore: number | null;
  severity: Record<string, Severity>;
  versions: Version[];
  zoomTo: [number, number] | null;

  addDataset: (d: Dataset, feats: Feature[]) => void;
  selectDataset: (id: string | null) => void;
  removeDataset: (id: string) => void;
  updateMeasure: (id: string, patch: Partial<MeasureConfig>) => void;
  run: () => void;
  loadVersion: (versionId: string) => void;
  setZoom: (p: [number, number]) => void;
  clearZoom: () => void;
}

export const useStore = create<GeoStore>()(
  persist(
    (set, get) => ({
      datasets: [], selectedId: null, featuresMap: {}, features: [],
      measures: DEFAULT_MEASURES,
      results: null, overallScore: null, severity: {}, versions: [], zoomTo: null,

      addDataset: (d, feats) =>
        set((s) => ({
          datasets: [...s.datasets, d],
          featuresMap: { ...s.featuresMap, [d.id]: feats },
          selectedId: d.id, features: feats,
          results: null, overallScore: null, severity: {},
        })),

      selectDataset: (id) =>
        set((s) => ({
          selectedId: id,
          features: (id && s.featuresMap[id]) || [],
          results: null, overallScore: null, severity: {},
        })),

      removeDataset: (id) =>
        set((s) => {
          const fm = { ...s.featuresMap };
          delete fm[id];
          const wasSelected = s.selectedId === id;
          return {
            datasets: s.datasets.filter((d) => d.id !== id),
            featuresMap: fm,
            versions: s.versions.filter((v) => v.datasetId !== id),
            ...(wasSelected ? { selectedId: null, features: [], results: null, overallScore: null, severity: {} } : {}),
          };
        }),

      updateMeasure: (id, patch) =>
        set((s) => ({ measures: s.measures.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),

      run: () => {
        const { features, measures, selectedId } = get();
        if (!features.length) return;
        const { results, overall } = runAssessment(features, measures);
        const severity = buildSeverity(results);
        const versionNumber = get().versions.filter((v) => v.datasetId === selectedId).length + 1;
        const version: Version = {
          id: uid(), datasetId: selectedId || '-', versionNumber,
          uploadTime: new Date().toISOString(), recordCount: features.length,
          overallScore: overall, results,
        };
        set({ results, overallScore: overall, severity, versions: [...get().versions, version] });
      },

      loadVersion: (versionId) =>
        set((s) => {
          const v = s.versions.find((x) => x.id === versionId);
          if (!v) return {};
          return { results: v.results, overallScore: v.overallScore, severity: buildSeverity(v.results) };
        }),

      setZoom: (p) => set({ zoomTo: p }),
      clearZoom: () => set({ zoomTo: null }),
    }),
    {
      name: 'geo-quality-pro',
      // персистим только JSON-сериализуемое; сами OL-объекты (features) — нет
      partialize: (s) =>
        ({ datasets: s.datasets, selectedId: s.selectedId, measures: s.measures, versions: s.versions }) as any,
    }
  )
);

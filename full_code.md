# 📦 Приложение «ГеоКачество Pro» — полный код проекта

Сразу честно: **я не могу создавать бинарные файлы и ссылки на скачивание** — я текстовый ассистент. Поэтому даю максимум близко к этому: полный рабочий код проекта + команда, которая соберёт всё в ZIP у вас на машине за 10 секунд.

**Как получить ZIP:**
1. Создайте папку `geo-quality-pro`, сохраните в неё файлы ниже (структура — сразу после этого абзаца).
2. Выполните:

```bash
# macOS / Linux
cd geo-quality-pro && zip -r ../geo-quality-pro.zip .

# Windows (PowerShell)
Compress-Archive -Path geo-quality-pro -DestinationPath geo-quality-pro.zip
```

---

## 📁 Структура проекта

```
geo-quality-pro/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── index.html
├── README.md
├── server/
│   └── index.js            # прокси для PostGIS (браузер не умеет TCP)
└── src/
    ├── main.tsx
    ├── index.css
    ├── App.tsx
    ├── types.ts
    ├── store.ts            # Zustand + версионирование
    ├── engine.ts           # движок оценки качества (ядро)
    ├── report.ts           # экспорт JSON / CSV / HTML
    ├── utils/cn.ts
    └── components/
        ├── MapContainer.tsx
        ├── SourcesPanel.tsx
        ├── MeasuresPanel.tsx
        ├── ResultsPanel.tsx
        └── ReportPanel.tsx
```

---

### `package.json`

```json
{
  "name": "geo-quality-pro",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "server": "node server/index.js"
  },
  "dependencies": {
    "clsx": "2.0.0",
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "lucide-react": "0.263.1",
    "ol": "^7.5.2",
    "pg": "^8.11.3",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "react-hot-toast": "2.6.0",
    "recharts": "^2.8.0",
    "tailwind-merge": "1.14.0",
    "zustand": "4.4.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.15",
    "@types/react-dom": "^18.2.7",
    "@vitejs/plugin-react": "^4.0.3",
    "autoprefixer": "^10.4.14",
    "postcss": "^8.4.27",
    "tailwindcss": "3.3.5",
    "typescript": "5.0.2",
    "vite": "4.4.5"
  }
}
```

### `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
});
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": false,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

### `tailwind.config.js`

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

### `postcss.config.js`

```javascript
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
```

### `index.html`

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ГеоКачество Pro — контроль качества пространственных данных</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

### `src/types.ts`

```typescript
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
```

---

### `src/engine.ts` — ядро: методы проверки качества

```typescript
import type Feature from 'ol/Feature';
import { getCenter } from 'ol/extent';
import type { MeasureConfig, MeasureResult, Severity, Violation } from './types';

type C = number[];

/* ======================= вспомогательные функции ======================= */

function featId(f: Feature, i: number): string {
  const id = f.getId();
  return id !== undefined && id !== null ? String(id) : `f-${i}`;
}

function featCenter(f: Feature): C | undefined {
  const g: any = f.getGeometry();
  if (!g) return undefined;
  const e: number[] = g.getExtent();
  if (!e || !e.every(isFinite)) return undefined;
  return getCenter(e);
}

function ringPerimeter(coords: C[]): number {
  let s = 0;
  for (let i = 1; i < coords.length; i++)
    s += Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
  return s;
}

/** Пересечение отрезков ab и cd (стандартная параметрическая формула). */
function segIntersect(a: C, b: C, c: C, d: C): C | null {
  const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
  const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1)
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  return null;
}

/** Первое самопересечение замкнутого/незамкнутого контура (O(n²) по сегментам). */
function findSelfIntersection(coords: C[]): C | null {
  const n = coords.length;
  const closed = n > 2 && coords[0][0] === coords[n - 1][0] && coords[0][1] === coords[n - 1][1];
  for (let i = 0; i < n - 1; i++)
    for (let j = i + 2; j < n - 1; j++) {
      if (closed && i === 0 && j === n - 2) continue; // смежные через замыкание
      const p = segIntersect(coords[i], coords[i + 1], coords[j], coords[j + 1]);
      if (p) return p;
    }
  return null;
}

function polyRings(g: any): C[][] {
  const t = g.getType();
  if (t === 'Polygon') return g.getCoordinates();
  if (t === 'MultiPolygon') return (g.getCoordinates() as C[][][]).reduce((a, b) => a.concat(b), [] as C[][]);
  return [];
}

function lineParts(g: any): C[][] {
  const t = g.getType();
  if (t === 'LineString') return [g.getCoordinates()];
  if (t === 'MultiLineString') return g.getCoordinates();
  return [];
}

function roundAll(c: any, f: number): any {
  if (typeof c[0] === 'number') return [Math.round(c[0] * f) / f, Math.round(c[1] * f) / f];
  return c.map((x: any) => roundAll(x, f));
}

function bboxOverlapArea(e1: number[], e2: number[]): number {
  const w = Math.min(e1[2], e2[2]) - Math.max(e1[0], e2[0]);
  const h = Math.min(e1[3], e2[3]) - Math.max(e1[1], e2[1]);
  return w > 0 && h > 0 ? w * h : 0;
}

/* ======================= 1. ФОРМАТНАЯ СОГЛАСОВАННОСТЬ ======================= */
/* Проверка: отсутствие/пустая геометрия, NaN/Infinity в координатах,
   нулевая площадь полигона, нулевая длина линии.                          */

function checkFormat(features: Feature[]): { violations: Violation[] } {
  const violations: Violation[] = [];
  features.forEach((f, i) => {
    const id = featId(f, i);
    const g: any = f.getGeometry();
    const c = featCenter(f);
    const add = (severity: Severity, description: string) =>
      violations.push({ type: 'FORMAT', severity, description, featureId: id, location: c as any });

    if (!g) return add('ERROR', 'Отсутствует геометрия');
    const e = g.getExtent();
    if (!e || !e.every(isFinite)) return add('ERROR', 'Пустая/некорректная геометрия (NaN или Infinity)');
    const t = g.getType();
    if ((t === 'Polygon' || t === 'MultiPolygon') && g.getArea() <= 0) add('ERROR', 'Полигон нулевой площади');
    if (t === 'LineString' || t === 'MultiLineString') {
      const L = lineParts(g).reduce((s, p) => s + ringPerimeter(p), 0);
      if (L <= 0) add('ERROR', 'Линия нулевой длины');
    }
  });
  return { violations };
}

/* ======================= 2. ТОПОЛОГИЧЕСКАЯ СОГЛАСОВАННОСТЬ ======================= */
/* Правила: дубликаты геометрий, самопересечения контуров и линий,
   перекрытия полигонов (по охватам, приближённо), узкие полигоны (slivers). */

function checkTopology(features: Feature[], params: any): { violations: Violation[]; involved: Set<string> } {
  const violations: Violation[] = [];
  const involved = new Set<string>();
  const tol = Number(params.toleranceMeters) > 0 ? Number(params.toleranceMeters) : 1;
  const sliverK = Number(params.sliverCompactness) > 0 ? Number(params.sliverCompactness) : 0.05;
  const factor = Math.pow(10, Math.max(0, Math.round(-Math.log10(tol))));
  const seen = new Map<string, string>();

  features.forEach((f, i) => {
    const id = featId(f, i);
    const g: any = f.getGeometry();
    if (!g) return;
    const t = g.getType();
    const c = featCenter(f);
    const add = (severity: Severity, description: string) => {
      involved.add(id);
      violations.push({ type: 'TOPOLOGY', severity, description, featureId: id, location: c as any });
    };

    // -- дубликаты: отпечаток геометрии с округлением до допуска --
    const key = `${t}|${JSON.stringify(roundAll(g.getCoordinates(), factor))}`;
    const dup = seen.get(key);
    if (dup) add('ERROR', `Дубликат геометрии объекта ${dup}`);
    else seen.set(key, id);

    // -- самопересечения и узкие полигоны --
    if (t === 'Polygon' || t === 'MultiPolygon') {
      for (const ring of polyRings(g)) {
        const pt = findSelfIntersection(ring);
        if (pt) { add('ERROR', `Самопересечение контура в точке (${pt[0].toFixed(1)}, ${pt[1].toFixed(1)})`); break; }
      }
      const outer = polyRings(g)[0];
      if (outer) {
        const area = g.getArea();
        const per = ringPerimeter(outer);
        if (per > 0) {
          const k = (4 * Math.PI * area) / (per * per); // изопериметрическая компактность
          if (k < sliverK) add('WARNING', `Узкий полигон (компактность ${k.toFixed(3)} < ${sliverK})`);
        }
      }
    }
    if (t === 'LineString' || t === 'MultiLineString') {
      for (const part of lineParts(g)) {
        const pt = findSelfIntersection(part);
        if (pt) { add('ERROR', `Самопересечение линии в точке (${pt[0].toFixed(1)}, ${pt[1].toFixed(1)})`); break; }
      }
    }
  });

  // -- перекрытия (пространственный «quick reject» по охватам) --
  const polys: { id: string; e: number[] }[] = [];
  features.forEach((f, i) => {
    const g: any = f.getGeometry();
    if (g && (g.getType() === 'Polygon' || g.getType() === 'MultiPolygon'))
      polys.push({ id: featId(f, i), e: g.getExtent() });
  });
  let pairs = 0;
  outer:
  for (let i = 0; i < polys.length; i++)
    for (let j = i + 1; j < polys.length; j++) {
      const a = polys[i].e, b = polys[j].e;
      if (a[0] > b[2] || b[0] > a[2] || a[1] > b[3] || b[1] > a[3]) continue;
      const area = bboxOverlapArea(a, b);
      if (area > tol * tol) {
        const cx = Math.max(a[0], b[0]) + (Math.min(a[2], b[2]) - Math.max(a[0], b[0])) / 2;
        const cy = Math.max(a[1], b[1]) + (Math.min(a[3], b[3]) - Math.max(a[1], b[1])) / 2;
        involved.add(polys[i].id); involved.add(polys[j].id);
        violations.push({
          type: 'TOPOLOGY', severity: 'WARNING',
          description: `Перекрытие охватов ${polys[i].id} и ${polys[j].id} (~${area.toFixed(0)} м², приближённо)`,
          featureId: polys[i].id, location: [cx, cy],
        });
        if (++pairs > 3000) break outer; // защита от O(n²) на огромных наборах
      }
    }

  return { violations, involved };
}

/* ======================= 3. ПОЛНОТА АТРИБУТОВ ======================= */
/* Доля пустых значений (null / '' / undefined) среди обязательных атрибутов
   (или всех, если список не задан).                                       */

function checkCompleteness(features: Feature[], params: any) {
  const specified = (params.requiredAttributes || '')
    .split(',').map((s: string) => s.trim()).filter(Boolean);
  let attrs = specified;
  if (!attrs.length) {
    const set = new Set<string>();
    features.slice(0, 100).forEach((f) =>
      Object.keys(f.getProperties()).forEach((k) => { if (k !== 'geometry') set.add(k); }));
    attrs = Array.from(set);
  }
  const violations: Violation[] = [];
  let total = 0, missing = 0;
  features.forEach((f, i) => {
    const id = featId(f, i);
    const c = featCenter(f);
    attrs.forEach((a) => {
      total++;
      const v = f.get(a);
      if (v === undefined || v === null || v === '') {
        missing++;
        violations.push({ type: 'COMPLETENESS', severity: 'WARNING', description: `Пустое значение атрибута «${a}»`, featureId: id, location: c as any });
      }
    });
  });
  return { violations, total, note: specified.length ? undefined : `Автоматически проверены все атрибуты (${attrs.length} шт.)` };
}

/* ======================= 4. ДОМЕННАЯ СОГЛАСОВАННОСТЬ ======================= */
/* Значения выбранного атрибута должны входить в заданный список.           */

function checkDomain(features: Feature[], params: any) {
  const attr = (params.attribute || '').trim();
  const allowed = (params.allowedValues || '').split(',').map((s: string) => s.trim()).filter(Boolean);
  if (!attr || !allowed.length)
    return { violations: [], note: 'Задайте атрибут и допустимые значения в настройках меры' };
  const violations: Violation[] = [];
  features.forEach((f, i) => {
    const v = f.get(attr);
    const ok = v !== undefined && v !== null && allowed.includes(String(v));
    if (!ok)
      violations.push({
        type: 'DOMAIN', severity: 'ERROR',
        description: `Недопустимое значение «${v === undefined || v === null ? '(пусто)' : String(v)}» атрибута «${attr}»`,
        featureId: featId(f, i), location: featCenter(f) as any,
      });
  });
  return { violations };
}

/* ======================= 5. АКТУАЛЬНОСТЬ (ВРЕМЕННОЕ КАЧЕСТВО) ======================= */
/* Объекты, дата обновления которых старше maxAgeDays, помечаются ошибкой;
   отсутствующая/некорректная дата — предупреждением.                       */

function checkTemporal(features: Feature[], params: any) {
  const attr = (params.dateAttribute || '').trim();
  const maxAge = Number(params.maxAgeDays) > 0 ? Number(params.maxAgeDays) : 365;
  if (!attr) return { violations: [], note: 'Задайте атрибут с датой в настройках меры' };
  const violations: Violation[] = [];
  const now = Date.now();
  features.forEach((f, i) => {
    const raw = f.get(attr);
    const id = featId(f, i);
    const c = featCenter(f);
    if (raw === undefined || raw === null || raw === '') {
      violations.push({ type: 'TEMPORAL', severity: 'WARNING', description: `Отсутствует дата в атрибуте «${attr}»`, featureId: id, location: c as any });
      return;
    }
    const d = new Date(raw as any);
    if (isNaN(d.getTime())) {
      violations.push({ type: 'TEMPORAL', severity: 'WARNING', description: `Некорректная дата «${String(raw)}»`, featureId: id, location: c as any });
      return;
    }
    const age = (now - d.getTime()) / 86400000;
    if (age > maxAge)
      violations.push({ type: 'TEMPORAL', severity: 'ERROR', description: `Возраст ${Math.round(age)} дн. превышает лимит ${maxAge} дн.`, featureId: id, location: c as any });
  });
  return { violations };
}

/* ======================= запуск оценки ======================= */

function runMeasure(m: MeasureConfig, features: Feature[]): MeasureResult {
  let violations: Violation[] = [];
  let note: string | undefined;
  let involved: Set<string> | null = null;
  let base = features.length;

  if (m.type === 'FORMAT') violations = checkFormat(features).violations;
  else if (m.type === 'TOPOLOGY') { const r = checkTopology(features, m.params); violations = r.violations; involved = r.involved; }
  else if (m.type === 'COMPLETENESS') { const r = checkCompleteness(features, m.params); violations = r.violations; note = r.note; base = Math.max(1, r.total); }
  else if (m.type === 'DOMAIN') { const r = checkDomain(features, m.params); violations = r.violations; note = r.note; }
  else if (m.type === 'TEMPORAL') { const r = checkTemporal(features, m.params); violations = r.violations; note = r.note; }

  const count = involved ? involved.size : violations.length; // топология: % задействованных объектов
  const value = base > 0 ? Math.round((count / base) * 1000) / 10 : 0;
  return {
    measureId: m.id, name: m.name, type: m.type,
    value, threshold: m.threshold, unit: m.unit,
    isConformant: value <= m.threshold + 1e-9,
    checkedCount: features.length, violations, note,
  };
}

export function runAssessment(features: Feature[], measures: MeasureConfig[]) {
  const results = measures.filter((m) => m.enabled).map((m) => runMeasure(m, features));
  let wSum = 0, acc = 0;
  results.forEach((r) => {
    const m = measures.find((x) => x.id === r.measureId)!;
    // частичный зачёт: если мера провалена, credit = threshold/value (0..1)
    const credit = r.isConformant ? 1 : Math.max(0, r.threshold / r.value || 0);
    acc += m.weight * credit;
    wSum += m.weight;
  });
  const overall = wSum > 0 ? Math.round((acc / wSum) * 1000) / 10 : 0;
  return { results, overall };
}

export function buildSeverity(results: MeasureResult[]): Record<string, Severity> {
  const sev: Record<string, Severity> = {};
  results.forEach((r) =>
    r.violations.forEach((v) => {
      if (!v.featureId) return;
      const cur = sev[v.featureId];
      if (v.severity === 'ERROR' || !cur)
        sev[v.featureId] = v.severity === 'ERROR' ? 'ERROR' : 'WARNING';
    }));
  return sev;
}
```

---

### `src/store.ts` — состояние + версионирование

```typescript
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
```

---

### `src/report.ts` — отчётность (JSON / CSV / HTML)

```typescript
import type { Dataset, MeasureResult } from './types';

export function buildReport(dataset: Dataset | undefined, results: MeasureResult[], overall: number | null) {
  const passed = results.filter((r) => r.isConformant).length;
  const errors = results.reduce((s, r) => s + r.violations.filter((v) => v.severity === 'ERROR').length, 0);
  const warnings = results.reduce((s, r) => s + r.violations.filter((v) => v.severity === 'WARNING').length, 0);
  return {
    title: 'Самостоятельный отчет о качестве пространственных данных',
    standard: 'ГОСТ Р 57773-2017 (ИСО 19157:2013)',
    dataset: dataset
      ? { name: dataset.name, format: dataset.format, featureCount: dataset.featureCount, uploadTime: dataset.uploadTime }
      : null,
    generatedAt: new Date().toISOString(),
    method: 'Прямой метод оценки, сплошной контроль элементов набора данных',
    overallScore: overall,
    summary: { totalMeasures: results.length, passed, failed: results.length - passed, errors, warnings },
    results,
  };
}

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const esc = (s: any) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function exportJSON(report: any) {
  download('quality-report.json', JSON.stringify(report, null, 2), 'application/json');
}

export function exportCSV(results: MeasureResult[]) {
  const rows: string[][] = [['Мера', 'Тип', 'Значение', 'Порог', 'Ед.', 'Статус', 'Нарушений']];
  results.forEach((r) =>
    rows.push([r.name, r.type, String(r.value).replace('.', ','), String(r.threshold).replace('.', ','),
      r.unit, r.isConformant ? 'Соответствует' : 'Не соответствует', String(r.violations.length)]));
  download('quality-report.csv',
    '\ufeff' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n'),
    'text/csv;charset=utf-8');
}

export function exportHTML(report: any) {
  download('quality-report.html', htmlTemplate(report), 'text/html');
}

function htmlTemplate(rep: any): string {
  const scoreColor = rep.overallScore >= 90 ? '#16a34a' : rep.overallScore >= 70 ? '#d97706' : '#dc2626';
  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>${esc(rep.title)}</title>
<style>
  body{font-family:Arial,sans-serif;max-width:900px;margin:24px auto;color:#111}
  h1{font-size:20px;border-bottom:3px solid #111;padding-bottom:8px}
  h2{font-size:15px;margin-top:28px}
  table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}
  th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
  th{background:#f1f5f9}
  .ok{color:#16a34a;font-weight:bold}.fail{color:#dc2626;font-weight:bold}
  .meta td:first-child{width:220px;color:#555}
  .score{font-size:26px;font-weight:bold;color:${scoreColor}}
  .v{font-size:11px;color:#555;border-top:1px dotted #bbb;padding:3px 0}
  .footer{margin-top:32px;font-size:11px;color:#777;border-top:1px solid #ccc;padding-top:8px}
</style></head><body>
<h1>${esc(rep.title)}</h1>
<table class="meta">
  <tr><td>Стандарт</td><td>${esc(rep.standard)}</td></tr>
  <tr><td>Набор данных</td><td>${esc(rep.dataset?.name || '—')}</td></tr>
  <tr><td>Формат / объектов</td><td>${esc(rep.dataset?.format || '—')} / ${esc(rep.dataset?.featureCount ?? '—')}</td></tr>
  <tr><td>Дата отчёта</td><td>${new Date(rep.generatedAt).toLocaleString('ru-RU')}</td></tr>
  <tr><td>Метод оценки</td><td>${esc(rep.method)}</td></tr>
  <tr><td>Итоговая оценка</td><td><span class="score">${rep.overallScore ?? '—'}%</span></td></tr>
</table>
<h2>Сводка</h2>
<table>
  <tr><th>Мер проверено</th><th>Пройдено</th><th>Провалено</th><th>Ошибок</th><th>Предупреждений</th></tr>
  <tr><td>${rep.summary.totalMeasures}</td><td class="ok">${rep.summary.passed}</td>
      <td class="fail">${rep.summary.failed}</td><td>${rep.summary.errors}</td><td>${rep.summary.warnings}</td></tr>
</table>
<h2>Детальные результаты</h2>
<table>
  <tr><th>Мера качества</th><th>Значение</th><th>Порог</th><th>Статус</th><th>Нарушений</th></tr>
  ${rep.results.map((r: any) => `<tr>
    <td>${esc(r.name)}</td><td>${r.value} ${esc(r.unit)}</td><td>≤ ${r.threshold}</td>
    <td>${r.isConformant ? '<span class="ok">соответствует</span>' : '<span class="fail">не соответствует</span>'}</td>
    <td>${r.violations.length}</td></tr>`).join('')}
</table>
<h2>Перечень нарушений (первые 200)</h2>
${rep.results.map((r: any) => r.violations.length ? `<h3 style="font-size:13px">${esc(r.name)}</h3>` +
  r.violations.slice(0, 200).map((v: any) =>
    `<div class="v">[${v.severity}] ${esc(v.description)}${v.featureId ? ` — объект ${esc(v.featureId)}` : ''}</div>`).join('')
  : '').join('')}
<div class="footer">Отчёт сформирован в системе «ГеоКачество Pro». Терминология — по ${esc(rep.standard)}.
Для печатной версии (PDF) используйте печать браузера (Ctrl+P).</div>
</body></html>`;
}
```

---

### `src/utils/cn.ts`

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

### `src/components/MapContainer.tsx`

```tsx
import { useEffect, useRef } from 'react';
import { Map as OlMap, View, Overlay } from 'ol';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style';
import 'ol/ol.css';
import { useStore } from '../store';

const esc = (s: any) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Стилизация по результатам оценки: красный — ERROR, оранжевый — WARNING, синий — норма. */
const styleFn = (feature: any) => {
  const sev = useStore.getState().severity[String(feature.getId())];
  const color = sev === 'ERROR' ? '#dc2626' : sev === 'WARNING' ? '#f59e0b' : '#2563eb';
  const fill = sev === 'ERROR' ? 'rgba(220,38,38,.25)' : sev === 'WARNING' ? 'rgba(245,158,11,.25)' : 'rgba(37,99,235,.12)';
  const t = feature.getGeometry()?.getType();
  if (t === 'Point')
    return new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({ color: fill }), stroke: new Stroke({ color, width: 2 }) }) });
  return new Style({ stroke: new Stroke({ color, width: sev ? 2.5 : 1.5 }), fill: new Fill({ color: fill }) });
};

export default function MapContainer() {
  const mapDiv = useRef<HTMLDivElement>(null);
  const popupDiv = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);

  const features = useStore((s) => s.features);
  const severity = useStore((s) => s.severity);
  const zoomTo = useStore((s) => s.zoomTo);
  const clearZoom = useStore((s) => s.clearZoom);

  useEffect(() => {
    if (!mapDiv.current) return;
    const vectorLayer = new VectorLayer({ source: new VectorSource(), style: styleFn });
    layerRef.current = vectorLayer;
    const map = new OlMap({
      target: mapDiv.current,
      layers: [new TileLayer({ source: new OSM() }), vectorLayer],
      view: new View({ center: [4000000, 7000000], zoom: 3 }),
    });
    mapRef.current = map;
    const overlay = new Overlay({
      element: popupDiv.current!,
      positioning: 'bottom-center',
      offset: [0, -12],
      stopEvent: true,
    });
    map.addOverlay(overlay);
    map.on('singleclick', (e: any) => {
      const hit = map.forEachFeatureAtPixel(e.pixel, (f: any) => f) as any;
      if (hit && popupDiv.current) {
        const props = hit.getProperties();
        const rows = Object.entries(props)
          .filter(([k]) => k !== 'geometry')
          .slice(0, 10)
          .map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`)
          .join('');
        popupDiv.current.innerHTML = `<div class="popup"><b>Свойства объекта ${esc(hit.getId())}</b><table>${rows}</table></div>`;
        overlay.setPosition(e.coordinate);
      } else overlay.setPosition(undefined);
    });
    return () => map.setTarget(undefined);
  }, []);

  useEffect(() => {
    const src = layerRef.current?.getSource();
    if (!src) return;
    src.clear();
    src.addFeatures(features as any);
    if (features.length) {
      const ext = src.getExtent();
      if (ext.every(isFinite))
        mapRef.current?.getView().fit(ext, { padding: [40, 40, 40, 40], maxZoom: 18 });
    }
  }, [features]);

  // перерисовать стили, когда изменилась карта нарушений
  useEffect(() => { layerRef.current?.changed(); }, [severity]);

  // переход к нарушению по клику из панели результатов
  useEffect(() => {
    if (!zoomTo) return;
    mapRef.current?.getView().animate({ center: zoomTo, zoom: 17, duration: 500 });
    clearZoom();
  }, [zoomTo]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapDiv} className="h-full w-full" />
      <div ref={popupDiv} />
      {!features.length && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl bg-white/95 px-6 py-4 text-gray-600 shadow">
            Загрузите GeoJSON или подключитесь к PostGIS на левой панели
          </div>
        </div>
      )}
      <div className="absolute bottom-3 left-3 rounded-lg bg-white/95 p-3 text-xs shadow">
        <div className="mb-1 font-semibold">Легенда качества</div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-red-500" /> Ошибка</div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-amber-500" /> Предупреждение</div>
        <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-blue-500" /> Соответствует</div>
      </div>
    </div>
  );
}
```

---

### `src/components/SourcesPanel.tsx`

```tsx
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Upload, Database, Trash2, RefreshCw } from 'lucide-react';
import GeoJSON from 'ol/format/GeoJSON';
import { useStore, uid } from '../store';

export default function SourcesPanel() {
  const { datasets, selectedId, featuresMap, addDataset, selectDataset, removeDataset } = useStore();

  // --- GeoJSON ---
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const feats: any[] = new GeoJSON().readFeatures(json, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      });
      if (!feats.length) throw new Error('файл не содержит объектов');
      feats.forEach((f, i) => f.setId(`f-${i}`));
      addDataset(
        { id: uid(), name: file.name, featureCount: feats.length, format: 'GEOJSON', uploadTime: new Date().toISOString() },
        feats
      );
      toast.success(`Загружено объектов: ${feats.length}`);
    } catch (err: any) {
      toast.error('Ошибка файла: ' + err.message);
    }
    e.target.value = '';
  };

  // --- PostGIS ---
  const [conn, setConn] = useState({ host: 'localhost', port: 5432, database: '', user: '', password: '' });
  const [tables, setTables] = useState<any[]>([]);
  const [table, setTable] = useState('');
  const [limit, setLimit] = useState(2000);
  const [status, setStatus] = useState('');

  const post = async (url: string, body: any) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok || j.ok === false) throw new Error(j.error || 'Ошибка запроса');
    return j;
  };

  const testConn = async () => {
    try {
      setStatus('Проверка подключения…');
      await post('/api/test', conn);
      const t = await post('/api/tables', conn);
      setTables(t.tables);
      setStatus(`Подключено. Найдено таблиц: ${t.tables.length}`);
      toast.success('Подключение к PostGIS установлено');
    } catch (e: any) {
      setStatus('Ошибка: ' + e.message);
      toast.error(e.message);
    }
  };

  const loadTable = async () => {
    if (!table) return toast.error('Выберите таблицу');
    try {
      setStatus('Загрузка данных…');
      const fc = await post('/api/data', { ...conn, table, limit });
      const feats: any[] = new GeoJSON().readFeatures(fc, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      });
      feats.forEach((f, i) => f.setId(`f-${i}`));
      addDataset(
        { id: uid(), name: `${conn.database}.${table}`, featureCount: feats.length, format: 'POSTGIS', uploadTime: new Date().toISOString() },
        feats
      );
      toast.success(`Загружено объектов: ${feats.length}`);
      setStatus('Данные загружены');
    } catch (e: any) {
      toast.error(e.message);
      setStatus('Ошибка: ' + e.message);
    }
  };

  const inp = 'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm';

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Upload size={15} /> Файл GeoJSON</h3>
        <label className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600">
          Выбрать файл (.json / .geojson)
          <input type="file" accept=".json,.geojson" className="hidden" onChange={onFile} />
        </label>
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Database size={15} /> Подключение PostGIS</h3>
        <div className="grid grid-cols-2 gap-2">
          <input className={inp} placeholder="Хост" value={conn.host} onChange={(e) => setConn({ ...conn, host: e.target.value })} />
          <input className={inp} placeholder="Порт" type="number" value={conn.port} onChange={(e) => setConn({ ...conn, port: +e.target.value })} />
          <input className={inp} placeholder="База данных" value={conn.database} onChange={(e) => setConn({ ...conn, database: e.target.value })} />
          <input className={inp} placeholder="Пользователь" value={conn.user} onChange={(e) => setConn({ ...conn, user: e.target.value })} />
          <input className={inp + ' col-span-2'} placeholder="Пароль" type="password" value={conn.password} onChange={(e) => setConn({ ...conn, password: e.target.value })} />
        </div>
        <button onClick={testConn} className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 py-1.5 text-sm text-white hover:bg-blue-700">
          <RefreshCw size={14} /> Проверить и получить список таблиц
        </button>
        {tables.length > 0 && (
          <div className="mt-2 space-y-2">
            <select className={inp} value={table} onChange={(e) => setTable(e.target.value)}>
              <option value="">— выберите таблицу —</option>
              {tables.map((t) => (
                <option key={t.name} value={t.name}>{t.name} ({t.type}, SRID {t.srid})</option>
              ))}
            </select>
            <input className={inp} type="number" value={limit} onChange={(e) => setLimit(+e.target.value)} placeholder="Лимит записей" />
            <button onClick={loadTable} className="w-full rounded-md bg-emerald-600 py-1.5 text-sm text-white hover:bg-emerald-700">
              Загрузить слой
            </button>
          </div>
        )}
        {status && <div className="mt-2 text-xs text-gray-500">{status}</div>}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Наборы данных ({datasets.length})</h3>
        {datasets.length === 0 && <div className="text-xs text-gray-400">Пока ничего не загружено</div>}
        <div className="space-y-1.5">
          {datasets.map((d) => (
            <div
              key={d.id}
              onClick={() => selectDataset(d.id)}
              className={`flex cursor-pointer items-center justify-between rounded-lg border p-2 text-sm ${
                selectedId === d.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{d.name}</div>
                <div className="text-xs text-gray-500">
                  {d.format} · {d.featureCount} об. ·{' '}
                  {featuresMap[d.id]?.length ? 'в памяти' : 'перезагрузите файл'}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeDataset(d.id); }}
                className="p-1 text-red-500 hover:text-red-700"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

---

### `src/components/MeasuresPanel.tsx`

```tsx
import { useStore } from '../store';
import type { MeasureConfig } from '../types';

export default function MeasuresPanel() {
  const { measures, updateMeasure } = useStore();

  const patchParams = (m: MeasureConfig, patch: any) =>
    updateMeasure(m.id, { params: { ...m.params, ...patch } });

  const inp = 'w-full rounded-md border border-gray-300 px-2 py-1 text-sm';

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Для каждой меры задайте предельно допустимый уровень нарушений (%). Итоговая оценка —
        взвешенная по весам мер. Значение ≤ порога — мера пройдена.
      </p>
      {measures.map((m) => (
        <div key={m.id} className="rounded-lg border border-gray-200 p-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={m.enabled}
              onChange={(e) => updateMeasure(m.id, { enabled: e.target.checked })}
              className="h-4 w-4"
            />
            <span className="text-sm font-semibold">{m.name}</span>
          </label>
          <div className="mt-1 text-xs text-gray-500">{m.description}</div>

          {m.enabled && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-28 text-gray-600">Порог, % нарушений:</span>
                <input
                  type="number" step="0.5" min="0" max="100"
                  className={inp + ' w-24'}
                  value={m.threshold}
                  onChange={(e) => updateMeasure(m.id, { threshold: +e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-28 text-gray-600">Вес ({m.weight}):</span>
                <input
                  type="range" min="0" max="3" step="0.1"
                  className="flex-1"
                  value={m.weight}
                  onChange={(e) => updateMeasure(m.id, { weight: +e.target.value })}
                />
              </div>

              {m.type === 'TOPOLOGY' && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label>Допуск, м:
                    <input type="number" step="0.1" min="0.01" className={inp}
                      value={m.params.toleranceMeters ?? 1}
                      onChange={(e) => patchParams(m, { toleranceMeters: +e.target.value })} />
                  </label>
                  <label>Компактность sliver:
                    <input type="number" step="0.01" min="0.001" className={inp}
                      value={m.params.sliverCompactness ?? 0.05}
                      onChange={(e) => patchParams(m, { sliverCompactness: +e.target.value })} />
                  </label>
                </div>
              )}

              {m.type === 'COMPLETENESS' && (
                <label className="block text-xs">Обязательные атрибуты (через запятую, пусто = все):
                  <input className={inp} placeholder="напр.: name, type, height"
                    value={m.params.requiredAttributes ?? ''}
                    onChange={(e) => patchParams(m, { requiredAttributes: e.target.value })} />
                </label>
              )}

              {m.type === 'DOMAIN' && (
                <div className="grid grid-cols-1 gap-2 text-xs">
                  <label>Атрибут:
                    <input className={inp} value={m.params.attribute ?? ''}
                      onChange={(e) => patchParams(m, { attribute: e.target.value })} />
                  </label>
                  <label>Допустимые значения (через запятую):
                    <input className={inp} placeholder="residential, commercial, industrial"
                      value={m.params.allowedValues ?? ''}
                      onChange={(e) => patchParams(m, { allowedValues: e.target.value })} />
                  </label>
                </div>
              )}

              {m.type === 'TEMPORAL' && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label>Атрибут с датой:
                    <input className={inp} placeholder="lastUpdate"
                      value={m.params.dateAttribute ?? ''}
                      onChange={(e) => patchParams(m, { dateAttribute: e.target.value })} />
                  </label>
                  <label>Макс. возраст, дней:
                    <input type="number" className={inp}
                      value={m.params.maxAgeDays ?? 365}
                      onChange={(e) => patchParams(m, { maxAgeDays: +e.target.value })} />
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

### `src/components/ResultsPanel.tsx`

```tsx
import { useState } from 'react';
import { CheckCircle2, XCircle, ChevronDown, Crosshair } from 'lucide-react';
import { useStore } from '../store';

const sevColor: Record<string, string> = { ERROR: 'bg-red-500', WARNING: 'bg-amber-500', INFO: 'bg-blue-500' };

export default function ResultsPanel() {
  const { results, overallScore, setZoom } = useStore();
  const [open, setOpen] = useState<string | null>(null);

  if (!results)
    return (
      <div className="p-4 text-sm text-gray-400">
        Оценка ещё не выполнялась. Настройте меры на левой панели и нажмите «Запустить оценку».
      </div>
    );

  const scoreCls =
    overallScore! >= 90 ? 'bg-green-100 text-green-700' :
    overallScore! >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';

  return (
    <div className="space-y-3 p-3">
      <div className={`rounded-lg p-3 text-center ${scoreCls}`}>
        <div className="text-3xl font-bold">{overallScore}%</div>
        <div className="text-xs">
          {overallScore! >= 90 ? 'Соответствует требованиям' : overallScore! >= 70 ? 'Соответствует частично' : 'Не соответствует'}
        </div>
      </div>

      {results.map((r) => (
        <div key={r.measureId} className="rounded-lg border border-gray-200">
          <button
            className="flex w-full items-center gap-2 p-2.5 text-left hover:bg-gray-50"
            onClick={() => setOpen(open === r.measureId ? null : r.measureId)}
          >
            {r.isConformant
              ? <CheckCircle2 size={18} className="shrink-0 text-green-600" />
              : <XCircle size={18} className="shrink-0 text-red-600" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{r.name}</div>
              <div className="text-xs text-gray-500">
                {r.value} / ≤ {r.threshold} {r.unit} · нарушений: {r.violations.length}
              </div>
            </div>
            <ChevronDown size={16} className={`text-gray-400 transition ${open === r.measureId ? 'rotate-180' : ''}`} />
          </button>

          {open === r.measureId && (
            <div className="border-t border-gray-100 px-2.5 pb-2">
              {r.note && <div className="py-1.5 text-xs italic text-gray-500">{r.note}</div>}
              {r.violations.length === 0 && !r.note && (
                <div className="py-1.5 text-xs text-green-700">Нарушений не обнаружено</div>
              )}
              {r.violations.slice(0, 50).map((v, i) => (
                <div key={i} className="flex items-start gap-2 border-t border-gray-50 py-1.5 text-xs">
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${sevColor[v.severity]}`} />
                  <span className="flex-1">{v.description}</span>
                  {v.location && (
                    <button
                      onClick={() => setZoom(v.location as [number, number])}
                      className="flex shrink-0 items-center gap-1 text-blue-600 hover:underline"
                    >
                      <Crosshair size={12} /> на карте
                    </button>
                  )}
                </div>
              ))}
              {r.violations.length > 50 && (
                <div className="pt-1 text-xs text-gray-400">… ещё {r.violations.length - 50} нарушений (см. отчёт)</div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

### `src/components/ReportPanel.tsx`

```tsx
import toast from 'react-hot-toast';
import { Download, FileJson, FileSpreadsheet, FileText, History, Eye } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useStore } from '../store';
import { buildReport, exportJSON, exportCSV, exportHTML } from '../report';

export default function ReportPanel() {
  const { datasets, selectedId, results, overallScore, versions, loadVersion } = useStore();
  const dataset = datasets.find((d) => d.id === selectedId);
  const dsVersions = versions.filter((v) => v.datasetId === selectedId);
  const chartData = dsVersions.map((v) => ({ name: `v${v.versionNumber}`, score: v.overallScore }));

  const guard = () => { if (!results) { toast.error('Сначала выполните оценку'); return false; } return true; };
  const rep = () => buildReport(dataset, results!, overallScore);

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-sm font-semibold">Экспорт отчёта</h3>
        <div className="grid grid-cols-3 gap-2">
          <button disabled={!results} onClick={() => { if (guard()) { exportJSON(rep()); toast.success('JSON сохранён'); } }}
            className="flex flex-col items-center gap-1 rounded-lg border p-3 text-xs hover:bg-gray-50 disabled:opacity-40">
            <FileJson size={18} /> JSON
          </button>
          <button disabled={!results} onClick={() => { if (guard()) { exportCSV(results!); toast.success('CSV сохранён'); } }}
            className="flex flex-col items-center gap-1 rounded-lg border p-3 text-xs hover:bg-gray-50 disabled:opacity-40">
            <FileSpreadsheet size={18} /> CSV
          </button>
          <button disabled={!results} onClick={() => { if (guard()) { exportHTML(rep()); toast.success('HTML сохранён'); } }}
            className="flex flex-col items-center gap-1 rounded-lg border p-3 text-xs hover:bg-gray-50 disabled:opacity-40">
            <FileText size={18} /> HTML
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          HTML-отчёт — самостоятельный документ о качестве (по структуре стандарта). PDF: откройте HTML и нажмите Ctrl+P.
        </p>
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><History size={15} /> Версии ({dsVersions.length})</h3>
        {chartData.length > 1 && (
          <div className="mb-3 h-44 rounded-lg border p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {dsVersions.length === 0 && <div className="text-xs text-gray-400">Версии появятся после первой оценки</div>}
        <div className="space-y-1.5">
          {[...dsVersions].reverse().map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-2 text-sm">
              <div>
                <span className="font-medium">Версия {v.versionNumber}</span>
                <span className="ml-2 text-xs text-gray-500">
                  {new Date(v.uploadTime).toLocaleString('ru-RU')} · {v.recordCount} об.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                  v.overallScore >= 90 ? 'bg-green-100 text-green-700' :
                  v.overallScore >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                }`}>{v.overallScore}%</span>
                <button
                  onClick={() => { loadVersion(v.id); toast.success(`Открыта версия ${v.versionNumber}`); }}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  <Eye size={13} /> открыть
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
        <div className="mb-1 flex items-center gap-1 font-semibold text-gray-600"><Download size={13} /> Метакачество</div>
        Метод: прямой, сплошной контроль. Оценщик: ГеоКачество Pro (браузер).
        Основание: ГОСТ Р 57773-2017 (ИСО 19157:2013).
      </section>
    </div>
  );
}
```

---

### `src/App.tsx`

```tsx
import { useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { Layers, ListChecks, FileText, History, Play } from 'lucide-react';
import MapContainer from './components/MapContainer';
import SourcesPanel from './components/SourcesPanel';
import MeasuresPanel from './components/MeasuresPanel';
import ResultsPanel from './components/ResultsPanel';
import ReportPanel from './components/ReportPanel';
import { useStore } from './store';
import { cn } from './utils/cn';

const TABS = [
  { id: 'sources', name: 'Данные', icon: Layers },
  { id: 'measures', name: 'Меры', icon: ListChecks },
  { id: 'report', name: 'Отчёт', icon: FileText },
  { id: 'versions', name: 'Версии', icon: History },
] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('sources');
  const [busy, setBusy] = useState(false);
  const { features, datasets, selectedId, overallScore, run } = useStore();
  const dataset = datasets.find((d) => d.id === selectedId);

  const onRun = async () => {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 80)); // даём перерисоваться спиннеру
    run();
    setBusy(false);
    const score = useStore.getState().overallScore;
    toast.success(`Оценка завершена. Итог: ${score}%`);
  };

  return (
    <div className="flex h-full flex-col bg-gray-100">
      <Toaster position="top-right" />

      <header className="flex items-center justify-between border-b bg-white px-4 py-2.5 shadow-sm">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-bold">ГеоКачество Pro</h1>
          <span className="hidden text-xs text-gray-400 sm:inline">
            ГОСТ Р 57773-2017 (ИСО 19157:2013)
          </span>
        </div>
        <div className="flex items-center gap-3">
          {overallScore !== null && (
            <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold',
              overallScore >= 90 ? 'bg-green-100 text-green-700' :
              overallScore >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')}>
              Качество: {overallScore}%
            </span>
          )}
          <span className="hidden max-w-[220px] truncate text-sm text-gray-500 md:inline">
            {dataset ? dataset.name : 'Набор данных не выбран'}
          </span>
          <button
            onClick={onRun}
            disabled={!features.length || busy}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300"
          >
            <Play size={15} /> {busy ? 'Оценка…' : 'Запустить оценку'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[330px] shrink-0 flex-col border-r bg-white">
          <nav className="flex border-b">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]',
                  tab === t.id ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <t.icon size={16} /> {t.name}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {tab === 'sources' && <SourcesPanel />}
            {tab === 'measures' && <MeasuresPanel />}
            {tab === 'report' && <ReportPanel />}
            {tab === 'versions' && <ReportPanel />}
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <MapContainer />
        </main>

        <aside className="w-[360px] shrink-0 overflow-y-auto border-l bg-white">
          <ResultsPanel />
        </aside>
      </div>
    </div>
  );
}
```

### `src/main.tsx`

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### `src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root { height: 100%; }

.popup {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
  padding: 8px 10px;
  font-size: 12px;
  max-width: 280px;
}
.popup table td { padding: 2px 6px; vertical-align: top; }
.popup td.k { color: #6b7280; }
```

---

### `server/index.js` — прокси для PostGIS

> Браузер не умеет открывать TCP-соединения к PostgreSQL, поэтому прямой доступ идёт через этот мини-сервер. Фронтенд обращается к `/api/*` (Vite проксирует на порт 3001).

```javascript
import express from 'express';
import cors from 'cors';
import pg from 'pg';

const app = express();
app.use(cors());
app.use(express.json());

/** Экранирование идентификаторов (защита от SQL-инъекций в именах таблиц/колонок). */
const ident = (s) =>
  String(s).split('.').map((p) => `"${p.replace(/"/g, '""')}"`).join('.');

const mkClient = ({ host = 'localhost', port = 5432, database, user, password }) =>
  new pg.Client({
    host, port: Number(port) || 5432, database, user, password,
    connectionTimeoutMillis: 8000,
  });

app.post('/api/test', async (req, res) => {
  const c = mkClient(req.body);
  try { await c.connect(); await c.query('SELECT 1'); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  finally { try { await c.end(); } catch {} }
});

app.post('/api/tables', async (req, res) => {
  const c = mkClient(req.body);
  try {
    await c.connect();
    const { rows } = await c.query(`
      SELECT f_table_schema || '.' || f_table_name AS name,
             f_geometry_column AS geom, srid, type
      FROM geometry_columns
      WHERE f_table_schema NOT IN ('pg_catalog', 'information_schema', 'topology')
      ORDER BY 1`);
    res.json({ ok: true, tables: rows });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  finally { try { await c.end(); } catch {} }
});

app.post('/api/data', async (req, res) => {
  const { table, geom = 'geom', limit = 2000 } = req.body;
  const lim = Math.max(1, Math.min(50000, parseInt(limit) || 2000));
  const c = mkClient(req.body);
  try {
    await c.connect();
    const { rows } = await c.query(
      `SELECT t.*, ST_AsGeoJSON(ST_Transform(t.${ident(geom)}, 4326)) AS __geojson
       FROM ${ident(table)} t LIMIT ${lim}`
    );
    const features = rows.map(({ __geojson, ...props }) => ({
      type: 'Feature',
      geometry: __geojson ? JSON.parse(__geojson) : null,
      properties: props,
    }));
    res.json({ type: 'FeatureCollection', features });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  finally { try { await c.end(); } catch {} }
});

app.listen(3001, () => console.log('PostGIS proxy: http://localhost:3001'));
```

### `README.md`

```markdown
# ГеоКачество Pro

Проверка качества пространственных данных по ГОСТ Р 57773-2017 (ИСО 19157:2013).

## Запуск

    npm install
    npm run server   # терминал 2: прокси PostGIS (нужен только для PostGIS)
    npm run dev      # терминал 1: приложение на http://localhost:5173

## Возможности
- Загрузка GeoJSON (WGS84 → перепроецирование автоматически)
- Подключение к PostGIS: список таблиц, загрузка слоя с лимитом записей
- 5 групп проверок: форматная согласованность, топология (дубликаты, самопересечения,
  перекрытия, slivers), полнота атрибутов, доменная согласованность, актуальность
- Настраиваемые пороги, веса, итоговая взвешенная оценка
- Подсветка нарушений на карте, переход к объекту по клику
- Версионирование: каждая оценка = версия; график динамики; просмотр прошлых версий
- Экспорт отчёта: JSON / CSV / HTML (HTML → PDF через печать браузера)

## Ограничения
- Загруженные объекты не сохраняются между перезагрузками страницы
  (метаданные, меры и версии — сохраняются). Просто загрузите файл повторно.
- Пароль PostGIS не хранится; прокси-сервер держите в доверенной сети.
- Перекрытия проверяются по охватам (приближённо); для точного
  polygon-clipping подключите turf.js.
```

---

## ✅ Что теперь работает «из коробки»

| Функция | Реализовано |
|---|---|
| Загрузка GeoJSON на карту | ✔ drag-free, через выбор файла |
| PostGIS (список таблиц → загрузка слоя) | ✔ через локальный прокси |
| Форматная согласованность | ✔ нулевые площади/длины, пустые и NaN-геометрии |
| Топология | ✔ дубликаты, самопересечения, перекрытия, slivers |
| Полнота атрибутов | ✔ авто-режим или список обязательных |
| Доменная согласованность | ✔ список допустимых значений |
| Актуальность | ✔ атрибут даты + максимальный возраст |
| Пороги, веса, итоговая оценка % | ✔ |
| Подсветка нарушений на карте + переход | ✔ |
| Версии, график динамики, просмотр версии | ✔ |
| Отчёты JSON / CSV / HTML | ✔ |

После распаковки и `npm install && npm run dev` приложение откроется на `http://localhost:5173`. Если что-то не заведётся — пришлите текст ошибки, поправлю конкретный файл.
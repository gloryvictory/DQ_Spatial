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
    const add = (severity: Severity, description: string, loc?: C) => {
      involved.add(id);
      violations.push({ type: 'TOPOLOGY', severity, description, featureId: id, location: (loc || c) as any });
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
        if (pt) { add('ERROR', `Самопересечение контура в точке (${pt[0].toFixed(1)}, ${pt[1].toFixed(1)})`, pt); break; }
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
        if (pt) { add('ERROR', `Самопересечение линии в точке (${pt[0].toFixed(1)}, ${pt[1].toFixed(1)})`, pt); break; }
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

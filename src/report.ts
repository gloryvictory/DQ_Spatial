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
  String(s).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');

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

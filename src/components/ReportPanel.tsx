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

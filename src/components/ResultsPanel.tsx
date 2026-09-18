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

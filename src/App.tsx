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

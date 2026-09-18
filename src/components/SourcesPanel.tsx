import { useState, useEffect } from 'react';
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
  const [connections, setConnections] = useState<string[]>([]);
  const [connection, setConnection] = useState('');
  const [tables, setTables] = useState<any[]>([]);
  const [table, setTable] = useState('');
  const [limit, setLimit] = useState(2000);
  const [status, setStatus] = useState('');

  // Загружаем список подключений из server/config.json
  useEffect(() => {
    fetch('/api/connections')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setConnections(j.connections);
          if (j.connections.length) setConnection(j.connections[0]);
        }
      })
      .catch(() => setStatus('Не удалось получить список подключений'));
  }, []);

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
    if (!connection) return toast.error('Выберите подключение');
    try {
      setStatus('Проверка подключения…');
      await post('/api/test', { connection });
      const t = await post('/api/tables', { connection });
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
      const fc = await post('/api/data', { connection, table, limit });
      const feats: any[] = new GeoJSON().readFeatures(fc, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      });
      feats.forEach((f, i) => f.setId(`f-${i}`));
      addDataset(
        { id: uid(), name: `${connection}.${table}`, featureCount: feats.length, format: 'POSTGIS', uploadTime: new Date().toISOString() },
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
        <select className={inp} value={connection} onChange={(e) => setConnection(e.target.value)}>
          {connections.length === 0 && <option value="">— нет подключений —</option>}
          {connections.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
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

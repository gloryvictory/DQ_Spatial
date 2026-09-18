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

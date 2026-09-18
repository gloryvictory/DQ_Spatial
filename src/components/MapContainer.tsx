import { useEffect, useRef } from 'react';
import { Map as OlMap, View, Overlay } from 'ol';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style';
import Point from 'ol/geom/Point';
import Feature from 'ol/Feature';
import 'ol/ol.css';
import { useStore } from '../store';

const esc = (s: any) => String(s).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');

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
  const blinkLayerRef = useRef<any>(null);
  const blinkTimerRef = useRef<any>(null);

  const features = useStore((s) => s.features);
  const severity = useStore((s) => s.severity);
  const zoomTo = useStore((s) => s.zoomTo);
  const clearZoom = useStore((s) => s.clearZoom);

  useEffect(() => {
    if (!mapDiv.current) return;
    const vectorLayer = new VectorLayer({ source: new VectorSource(), style: styleFn });
    layerRef.current = vectorLayer;
    // отдельный слой для мигающей метки нарушения
    const blinkLayer = new VectorLayer({ source: new VectorSource(), zIndex: 10 });
    blinkLayerRef.current = blinkLayer;
    const map = new OlMap({
      target: mapDiv.current,
      layers: [new TileLayer({ source: new OSM() }), vectorLayer, blinkLayer],
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
          .map(([k, v]) => {
            let val = v;
            // WKT-геометрия — длинная строка без пробелов, показываем только тип
            if (k === 'geom' && typeof val === 'string' && val.length > 60)
              val = val.slice(0, 40) + '…';
            return `<tr><td class="k">${esc(k)}</td><td>${esc(val)}</td></tr>`;
          })
          .join('');
        popupDiv.current.innerHTML = `<div class="popup"><b>Свойства объекта ${esc(hit.getId())}</b><table>${rows}</table></div>`;
        overlay.setPosition(e.coordinate);
      } else overlay.setPosition(undefined);
    });
    return () => {
      if (blinkTimerRef.current) clearInterval(blinkTimerRef.current);
      map.setTarget(undefined);
    };
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

  // переход к нарушению по клику из панели результатов + мигающая метка
  useEffect(() => {
    if (!zoomTo) return;
    mapRef.current?.getView().animate({ center: zoomTo, zoom: 17, duration: 500 });
    clearZoom();

    // мигающая метка в точке нарушения
    const blinkSrc = blinkLayerRef.current?.getSource();
    if (!blinkSrc) return;
    blinkSrc.clear();

    const pt = new Feature({ geometry: new Point(zoomTo) });
    let visible = true;
    const setStyle = () => {
      pt.setStyle(new Style({
        image: new CircleStyle({
          radius: visible ? 10 : 0,
          fill: new Fill({ color: 'rgba(220,38,38,0.7)' }),
          stroke: new Stroke({ color: '#dc2626', width: 3 }),
        }),
      }));
      blinkSrc.changed();
    };
    setStyle();
    blinkSrc.addFeature(pt);

    // мигание: 6 раз по 300 мс (вкл/выкл), затем убрать метку
    let count = 0;
    blinkTimerRef.current = setInterval(() => {
      count++;
      if (count >= 12) {
        clearInterval(blinkTimerRef.current);
        blinkSrc.clear();
        return;
      }
      visible = !visible;
      setStyle();
    }, 300);
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

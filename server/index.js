import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Конфигурация подключений к PostGIS.
 * Файл server/config.json содержит массив:
 *   [ { "name_ru": "Пример", "dsn": "postgres://user:pass@host:5432/db?sslmode=disable" }, ... ]
 */
const connections = JSON.parse(
  readFileSync(join(__dirname, 'config.json'), 'utf8')
);

const app = express();
app.use(cors());
app.use(express.json());

/** Экранирование идентификаторов (защита от SQL-инъекций в именах таблиц/колонок). */
const ident = (s) =>
  String(s).split('.').map((p) => `"${p.replace(/"/g, '""')}"`).join('.');

/** Возвращает DSN по имени подключения (name_ru). */
const dsnFor = (name) => {
  const c = connections.find((x) => x.name_ru === name);
  return c ? c.dsn : null;
};

/** Создаёт pg.Client по имени подключения из config.json. */
const mkClient = (name) => {
  const dsn = dsnFor(name);
  if (!dsn) throw new Error('Неизвестное подключение: ' + name);
  return new pg.Client({
    connectionString: dsn,
    connectionTimeoutMillis: 8000,
  });
};

/** Список доступных подключений (без DSN/паролей). */
app.get('/api/connections', (req, res) => {
  res.json({ ok: true, connections: connections.map((c) => c.name_ru) });
});

app.post('/api/test', async (req, res) => {
  const c = mkClient(req.body.connection);
  try { await c.connect(); await c.query('SELECT 1'); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  finally { try { await c.end(); } catch {} }
});

app.post('/api/tables', async (req, res) => {
  const c = mkClient(req.body.connection);
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
  const { connection, table, geom = 'geom', limit = 2000 } = req.body;
  const lim = Math.max(1, Math.min(50000, parseInt(limit) || 2000));
  const c = mkClient(connection);
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

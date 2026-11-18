import express from 'express';
import pg from 'pg';
import { registerCustomerRoutes } from './customer.ts';
import type { ErrorRequestHandler } from 'express';

const { DATABASE_URL, PORT = '3000', HOST = '127.0.0.1' } = process.env;
if (!DATABASE_URL && !process.env.PGHOST) throw new Error('Define DATABASE_URL o PGHOST antes de iniciar EventHub.');

const pool = new pg.Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 5000 });
pool.on('error', (error) => console.error('Conexión inactiva con PostgreSQL', error));

const app = express();
app.use(express.json({ limit: '8kb' }));
registerCustomerRoutes(app, pool);

app.get('/api/health', async (_request, response) => {
  response.set('Cache-Control', 'no-store');
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok' });
  } catch {
    response.status(503).json({ status: 'unavailable' });
  }
});

app.get('/api/events', async (_request, response) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, title, description, venue, starts_at AS "startsAt",
             available_seats AS "availableSeats"
      FROM events
      WHERE starts_at >= NOW()
      ORDER BY starts_at, id
    `);
    response.json(rows);
  } catch (error) {
    console.error('Error al consultar eventos', error);
    response.status(503).json({ message: 'No se pudieron consultar los eventos.' });
  }
});

const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error.status === 400 || error.status === 413) {
    response.status(error.status).json({ message: 'El contenido de la solicitud no es válido.' });
    return;
  }
  console.error('Error en EventHub', error);
  response.status(500).json({ message: 'No se pudo completar la solicitud.' });
};
app.use(handleError);

app.listen(Number(PORT), HOST, () => {
  console.log(`API de EventHub disponible en http://127.0.0.1:${PORT}`);
});



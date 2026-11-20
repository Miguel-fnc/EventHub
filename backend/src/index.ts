import { Hono } from 'hono';
import { BadRequest, now } from './app.ts';
import type { AppEnv } from './app.ts';
import { registerAdminRoutes } from './admin.ts';
import { registerCustomerRoutes } from './customer.ts';

const app = new Hono<AppEnv>();

app.get('/api/health', async (c) => {
  c.header('Cache-Control', 'no-store');
  try {
    await c.env.DB.prepare('SELECT 1').first();
    return c.json({ status: 'ok' });
  } catch {
    return c.json({ status: 'unavailable' }, 503);
  }
});

app.get('/api/events', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT id, title, description, venue, starts_at AS startsAt,
             available_seats AS availableSeats
      FROM events
      WHERE starts_at >= ?
      ORDER BY starts_at, id
    `).bind(now()).all();
    return c.json(results);
  } catch (error) {
    console.error('Error al consultar eventos', error);
    return c.json({ message: 'No se pudieron consultar los eventos.' }, 503);
  }
});

registerCustomerRoutes(app);
registerAdminRoutes(app);

app.all('/api/*', (c) => c.json({ message: 'Ruta no encontrada.' }, 404));

// Todo lo que no es /api lo sirve el frontend (Workers Static Assets).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

app.onError((error, c) => {
  if (error instanceof BadRequest) return c.json({ message: 'El contenido de la solicitud no es válido.' }, 400);
  console.error('Error en EventHub', error);
  return c.json({ message: 'No se pudo completar la solicitud.' }, 500);
});

export default app;

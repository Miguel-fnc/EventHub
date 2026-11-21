import { d1Error, now, readJson } from './app.ts';
import type { App } from './app.ts';
import { eventId, eventInput } from './validation.ts';

export function registerAdminRoutes(app: App) {
  const invalidId = { message: 'Identificador de evento inválido.' };

  app.get('/api/admin/events', async (c) => {
    const { results } = await c.env.DB.prepare(`
      SELECT id, title, venue, description, starts_at AS startsAt,
             capacity, available_seats AS availableSeats,
             -- Solo las reservaciones activas impiden eliminar el evento.
             (SELECT COUNT(*) FROM reservations
               WHERE event_id = events.id AND cancellation_code IS NULL) AS activeReservations,
             -- Las canceladas se borran junto con el evento.
             (SELECT COUNT(*) FROM reservations
               WHERE event_id = events.id AND cancellation_code IS NOT NULL) AS cancelledReservations
      FROM events ORDER BY starts_at DESC, id
    `).all();
    return c.json(results);
  });

  app.post('/api/admin/events', async (c) => {
    const input = eventInput(await readJson(c));
    if (!input || input[3] <= now()) {
      return c.json({ message: 'Completa los datos del evento y elige una fecha futura.' }, 400);
    }
    const row = await c.env.DB.prepare(`
      INSERT INTO events (title, venue, description, starts_at, capacity, available_seats)
      VALUES (?1, ?2, ?3, ?4, ?5, ?5) RETURNING id
    `).bind(...input).first<{ id: number }>();
    return c.json(row, 201);
  });

  app.patch('/api/admin/events/:eventId', async (c) => {
    const id = eventId(c.req.param('eventId'));
    if (!id) return c.json(invalidId, 400);
    const input = eventInput(await readJson(c));
    if (!input) return c.json({ message: 'Revisa los datos del evento y el cupo.' }, 400);
    const result = await c.env.DB.prepare(`
      UPDATE events SET title = ?1, venue = ?2, description = ?3, starts_at = ?4,
        available_seats = ?5 - (capacity - available_seats), capacity = ?5
      WHERE id = ?6 AND ?5 >= capacity - available_seats
        AND (?4 = starts_at OR ?4 > ?7)
    `).bind(...input, id, now()).run();
    if (!result.meta.changes) {
      return c.json({ message: 'El evento no existe, la nueva fecha ya pasó o el cupo es menor que los lugares reservados.' }, 409);
    }
    return c.body(null, 204);
  });

  app.delete('/api/admin/events/:eventId', async (c) => {
    const id = eventId(c.req.param('eventId'));
    if (!id) return c.json(invalidId, 400);
    const blocked = 'Este evento tiene reservaciones activas y no se puede eliminar.';
    // Sin reservaciones activas, se borran las canceladas y el evento en una sola transacción
    // (batch de D1). La condición se evalúa dentro de cada sentencia, así que una reservación
    // creada al mismo tiempo nunca se pierde: en ese caso no se borra nada.
    const noActive = 'NOT EXISTS (SELECT 1 FROM reservations WHERE event_id = ?1 AND cancellation_code IS NULL)';
    try {
      const [, deleted] = await c.env.DB.batch([
        c.env.DB.prepare(`DELETE FROM reservations WHERE event_id = ?1 AND cancellation_code IS NOT NULL AND ${noActive}`).bind(id),
        c.env.DB.prepare(`DELETE FROM events WHERE id = ?1 AND ${noActive}`).bind(id)
      ]);
      if (deleted.meta.changes) return c.body(null, 204);
      const exists = await c.env.DB.prepare('SELECT 1 FROM events WHERE id = ?').bind(id).first();
      return exists ? c.json({ message: blocked }, 409) : c.json({ message: 'El evento no existe.' }, 404);
    } catch (error) {
      if (!d1Error(error, 'FOREIGN KEY constraint failed')) throw error;
      return c.json({ message: blocked }, 409);
    }
  });

  app.get('/api/admin/events/:eventId/reservations', async (c) => {
    const id = eventId(c.req.param('eventId'));
    if (!id) return c.json(invalidId, 400);
    const { results } = await c.env.DB.prepare(`
      SELECT reservations.id, users.email, seats, cancellation_code IS NOT NULL AS cancelled
      FROM reservations JOIN users ON users.id = reservations.user_id
      WHERE event_id = ? ORDER BY created_at DESC, reservations.id
    `).bind(id).all<{ cancelled: number }>();
    return c.json(results.map((row) => ({ ...row, cancelled: Boolean(row.cancelled) })));
  });
}

import type { Express } from 'express';
import type { Pool } from 'pg';

export function eventInput(body: unknown) {
  const { title, venue, description, startsAt, capacity } = (body ?? {}) as Record<string, unknown>;
  if (typeof title !== 'string' || !title.trim() || title.length > 120 ||
      typeof venue !== 'string' || !venue.trim() || venue.length > 160 ||
      typeof description !== 'string' || description.length > 2000 ||
      typeof startsAt !== 'string' || !Number.isFinite(Date.parse(startsAt)) ||
      typeof capacity !== 'number' || !Number.isInteger(capacity) ||
      capacity < 1 || capacity > 2147483647) return null;
  return [title.trim(), venue.trim(), description.trim(), new Date(startsAt).toISOString(), capacity];
}

export function registerAdminRoutes(app: Express, pool: Pool) {
  app.param('eventId', (request, response, next, value: string) => {
    if (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) {
      response.status(400).json({ message: 'Identificador de evento inválido.' });
      return;
    }
    next();
  });

  app.get('/api/admin/events', async (_request, response) => {
    const { rows } = await pool.query(`
      SELECT id, title, venue, description, starts_at AS "startsAt",
             capacity, available_seats AS "availableSeats"
      FROM events ORDER BY starts_at DESC, id
    `);
    response.json(rows);
  });

  app.post('/api/admin/events', async (request, response) => {
    const input = eventInput(request.body);
    if (!input || Date.parse(String(input[3])) <= Date.now()) {
      response.status(400).json({ message: 'Completa los datos del evento y elige una fecha futura.' });
      return;
    }
    const { rows } = await pool.query(`
      INSERT INTO events (title, venue, description, starts_at, capacity, available_seats)
      VALUES ($1, $2, $3, $4, $5, $5) RETURNING id
    `, input);
    response.status(201).json(rows[0]);
  });

  app.patch('/api/admin/events/:eventId', async (request, response) => {
    const input = eventInput(request.body);
    if (!input) {
      response.status(400).json({ message: 'Revisa los datos del evento y el cupo.' });
      return;
    }
    const result = await pool.query(`
      UPDATE events SET title = $1, venue = $2, description = $3, starts_at = $4,
        available_seats = $5 - (capacity - available_seats), capacity = $5
      WHERE id = $6 AND $5 >= capacity - available_seats
        AND ($4 = starts_at OR $4 > NOW())
    `, [...input, request.params.eventId]);
    if (!result.rowCount) {
      response.status(409).json({ message: 'El evento no existe, la nueva fecha ya pasó o el cupo es menor que los lugares reservados.' });
      return;
    }
    response.status(204).end();
  });

  app.delete('/api/admin/events/:eventId', async (request, response) => {
    try {
      const result = await pool.query('DELETE FROM events WHERE id = $1', [request.params.eventId]);
      if (!result.rowCount) {
        response.status(404).json({ message: 'El evento no existe.' });
        return;
      }
      response.status(204).end();
    } catch (error) {
      if ((error as { code?: string }).code !== '23503') throw error;
      response.status(409).json({ message: 'Este evento tiene historial de reservaciones y no se puede eliminar.' });
    }
  });

  app.get('/api/admin/events/:eventId/reservations', async (request, response) => {
    const { rows } = await pool.query(`
      SELECT reservations.id, users.email, seats, cancellation_code IS NOT NULL AS cancelled
      FROM reservations JOIN users ON users.id = reservations.user_id
      WHERE event_id = $1 ORDER BY created_at DESC, reservations.id
    `, [request.params.eventId]);
    response.json(rows);
  });
}

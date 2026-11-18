import { registerAdminRoutes } from './admin.ts';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Express, Request } from 'express';
import type { Pool } from 'pg';

const deriveKey = promisify(scrypt);
const dummySalt = randomBytes(16).toString('hex');
const maxInt = 2147483647;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function credentials(body: unknown) {
  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254 ||
      typeof password !== 'string' || password.length < 8 || password.length > 128) return null;
  return { email: normalized, password };
}

function tokenHash(request: Request) {
  const token = /^Bearer ([a-f0-9]{64})$/.exec(request.get('authorization') ?? '')?.[1];
  return token ? hashToken(token) : null;
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= maxInt;
}

export function registerCustomerRoutes(app: Express, pool: Pool) {
  async function currentUser(request: Request) {
    const hash = tokenHash(request);
    if (!hash) return null;
    const { rows } = await pool.query<{ id: number; email: string; role: string }>(`
      SELECT users.id, users.email, users.role FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE token_hash = $1 AND expires_at > NOW()
    `, [hash]);
    return rows[0] ?? null;
  }

  app.post('/api/auth/register', async (request, response) => {
    const input = credentials(request.body);
    if (!input) {
      response.status(400).json({ message: 'Ingresa un correo válido y una contraseña de 8 a 128 caracteres.' });
      return;
    }
    const salt = randomBytes(16).toString('hex');
    const key = await deriveKey(input.password, salt, 64) as Buffer;
    const result = await pool.query(`
      INSERT INTO users (email, password_hash) VALUES ($1, $2)
      ON CONFLICT (email) DO NOTHING
    `, [input.email, `${salt}:${key.toString('hex')}`]);
    if (!result.rowCount) {
      response.status(409).json({ message: 'Ya existe una cuenta con ese correo.' });
      return;
    }
    response.status(201).json({ email: input.email });
  });

  app.post('/api/auth/login', async (request, response) => {
    const input = credentials(request.body);
    const invalid = { message: 'Correo o contraseña incorrectos.' };
    if (!input) {
      response.status(401).json(invalid);
      return;
    }
    const { rows: [user] } = await pool.query<{ id: number; email: string; password_hash: string; role: string }>(
      'SELECT id, email, password_hash, role FROM users WHERE email = $1', [input.email]
    );
    const [salt, storedKey] = user?.password_hash.split(':') ?? [dummySalt, ''];
    const key = await deriveKey(input.password, salt, 64) as Buffer;
    if (!user || !timingSafeEqual(key, Buffer.from(storedKey, 'hex'))) {
      response.status(401).json(invalid);
      return;
    }
    const token = randomBytes(32).toString('hex');
    await pool.query(`
      INSERT INTO sessions (token_hash, user_id, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '8 hours')
    `, [hashToken(token), user.id]);
    response.set('Cache-Control', 'no-store').json({ token, email: user.email, role: user.role });
  });

  app.post('/api/auth/logout', async (request, response) => {
    const hash = tokenHash(request);
    if (hash) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hash]);
    response.status(204).end();
  });

  app.get('/api/reservations', async (request, response) => {
    const user = await currentUser(request);
    if (!user) {
      response.status(401).json({ message: 'Inicia sesión para ver tus reservaciones.' });
      return;
    }
    const { rows } = await pool.query(`
      SELECT reservations.id, events.title, events.starts_at AS "startsAt",
             seats, cancellation_code AS "cancellationCode",
             (cancellation_code IS NULL AND events.starts_at > NOW()) AS "canCancel"
      FROM reservations JOIN events ON events.id = reservations.event_id
      WHERE user_id = $1 ORDER BY created_at DESC, reservations.id
    `, [user.id]);
    response.set('Cache-Control', 'no-store').json(rows);
  });

  app.post('/api/reservations', async (request, response) => {
    const user = await currentUser(request);
    if (!user) {
      response.status(401).json({ message: 'Inicia sesión para reservar.' });
      return;
    }
    const { eventId, seats } = request.body ?? {};
    if (!positiveInteger(eventId) || !positiveInteger(seats)) {
      response.status(400).json({ message: 'Selecciona un evento y una cantidad válida de lugares.' });
      return;
    }
    try {
      const { rows } = await pool.query(`
        WITH reserved_event AS (
          UPDATE events SET available_seats = available_seats - $2
          WHERE id = $1 AND starts_at > NOW() AND available_seats >= $2
          RETURNING id
        )
        INSERT INTO reservations (id, user_id, event_id, seats)
        SELECT $3, $4, id, $2 FROM reserved_event
        RETURNING id AS "confirmationCode"
      `, [eventId, seats, randomUUID(), user.id]);
      if (!rows.length) {
        response.status(409).json({ message: 'El evento ya comenzó o no tiene suficientes lugares.' });
        return;
      }
      response.status(201).json(rows[0]);
    } catch (error) {
      if ((error as { constraint?: string }).constraint !== 'reservations_active_idx') throw error;
      response.status(409).json({ message: 'Ya tienes una reservación activa para este evento.' });
    }
  });

  app.post('/api/reservations/:id/cancel', async (request, response) => {
    const user = await currentUser(request);
    if (!user) {
      response.status(401).json({ message: 'Inicia sesión para cancelar.' });
      return;
    }
    if (!uuid.test(request.params.id)) {
      response.status(400).json({ message: 'Código de reservación inválido.' });
      return;
    }
    const { rows } = await pool.query(`
      WITH locked_event AS MATERIALIZED (
        SELECT events.id FROM events JOIN reservations ON reservations.event_id = events.id
        WHERE reservations.id = $1 AND user_id = $2 AND starts_at > NOW()
        FOR UPDATE OF events
      ), cancelled AS (
        UPDATE reservations SET cancellation_code = $3
        WHERE id = $1 AND user_id = $2 AND cancellation_code IS NULL
          AND event_id IN (SELECT id FROM locked_event)
        RETURNING event_id, seats, cancellation_code
      ), restored AS (
        UPDATE events SET available_seats = available_seats + cancelled.seats
        FROM cancelled WHERE events.id = cancelled.event_id RETURNING events.id
      )
      SELECT cancellation_code AS "cancellationCode" FROM cancelled JOIN restored
        ON restored.id = cancelled.event_id
    `, [request.params.id, user.id, randomUUID()]);
    if (!rows.length) {
      response.status(409).json({ message: 'La reservación no está disponible para cancelar.' });
      return;
    }
    response.json(rows[0]);
  });
  app.use('/api/admin', async (request, response, next) => {
    const user = await currentUser(request);
    if (!user) {
      response.status(401).json({ message: 'Inicia sesión para continuar.' });
      return;
    }
    if (user.role !== 'admin') {
      response.status(403).json({ message: 'Se requieren permisos de administrador.' });
      return;
    }
    response.set('Cache-Control', 'no-store');
    next();
  });
  registerAdminRoutes(app, pool);
}


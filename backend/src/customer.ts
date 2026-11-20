import { d1Error, now, readJson } from './app.ts';
import type { App, AppEnv, User } from './app.ts';
import { hashPassword, randomHex, sha256, verifyPassword } from './crypto.ts';
import { credentials, positiveInteger, uuid } from './validation.ts';
import type { Context } from 'hono';

const sessionHours = 8;

async function currentUser(c: Context<AppEnv>): Promise<User | null> {
  const token = /^Bearer ([a-f0-9]{64})$/.exec(c.req.header('authorization') ?? '')?.[1];
  if (!token) return null;
  return c.env.DB.prepare(`
    SELECT users.id, users.email, users.role FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE token_hash = ? AND expires_at > ?
  `).bind(await sha256(token), now()).first<User>();
}

export function registerCustomerRoutes(app: App) {
  app.post('/api/auth/register', async (c) => {
    const input = credentials(await readJson(c));
    if (!input) {
      return c.json({ message: 'Ingresa un correo válido y una contraseña de 8 a 128 caracteres.' }, 400);
    }
    const result = await c.env.DB.prepare(`
      INSERT INTO users (email, password_hash) VALUES (?, ?)
      ON CONFLICT (email) DO NOTHING
    `).bind(input.email, await hashPassword(input.password)).run();
    if (!result.meta.changes) return c.json({ message: 'Ya existe una cuenta con ese correo.' }, 409);
    return c.json({ email: input.email }, 201);
  });

  app.post('/api/auth/login', async (c) => {
    const input = credentials(await readJson(c));
    const invalid = { message: 'Correo o contraseña incorrectos.' };
    if (!input) return c.json(invalid, 401);
    const user = await c.env.DB.prepare('SELECT id, email, password_hash, role FROM users WHERE email = ?')
      .bind(input.email).first<User & { password_hash: string }>();
    if (!await verifyPassword(input.password, user?.password_hash) || !user) return c.json(invalid, 401);
    const token = randomHex(32);
    const expires = new Date(Date.now() + sessionHours * 3600_000).toISOString();
    await c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(await sha256(token), user.id, expires).run();
    c.header('Cache-Control', 'no-store');
    return c.json({ token, email: user.email, role: user.role });
  });

  app.post('/api/auth/logout', async (c) => {
    const token = /^Bearer ([a-f0-9]{64})$/.exec(c.req.header('authorization') ?? '')?.[1];
    if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    return c.body(null, 204);
  });

  app.get('/api/reservations', async (c) => {
    const user = await currentUser(c);
    if (!user) return c.json({ message: 'Inicia sesión para ver tus reservaciones.' }, 401);
    const { results } = await c.env.DB.prepare(`
      SELECT reservations.id, events.title, events.starts_at AS startsAt,
             seats, cancellation_code AS cancellationCode,
             (cancellation_code IS NULL AND events.starts_at > ?) AS canCancel
      FROM reservations JOIN events ON events.id = reservations.event_id
      WHERE user_id = ? ORDER BY created_at DESC, reservations.id
    `).bind(now(), user.id).all<{ canCancel: number }>();
    c.header('Cache-Control', 'no-store');
    return c.json(results.map((row) => ({ ...row, canCancel: Boolean(row.canCancel) })));
  });

  app.post('/api/reservations', async (c) => {
    const user = await currentUser(c);
    if (!user) return c.json({ message: 'Inicia sesión para reservar.' }, 401);
    const { eventId, seats } = (await readJson(c) ?? {}) as Record<string, unknown>;
    if (!positiveInteger(eventId) || !positiveInteger(seats)) {
      return c.json({ message: 'Selecciona un evento y una cantidad válida de lugares.' }, 400);
    }
    const id = crypto.randomUUID();
    const timestamp = now();
    try {
      // Un batch de D1 es una transacción: si algo falla, no se aplica ningún cambio.
      const [inserted] = await c.env.DB.batch([
        c.env.DB.prepare(`
          INSERT INTO reservations (id, user_id, event_id, seats, created_at)
          SELECT ?, ?, id, ?, ? FROM events
          WHERE id = ? AND starts_at > ? AND available_seats >= ?
        `).bind(id, user.id, seats, timestamp, eventId, timestamp, seats),
        c.env.DB.prepare(`
          UPDATE events SET available_seats = available_seats - ?
          WHERE id = ? AND EXISTS (SELECT 1 FROM reservations WHERE id = ?)
        `).bind(seats, eventId, id)
      ]);
      if (!inserted.meta.changes) {
        return c.json({ message: 'El evento ya comenzó o no tiene suficientes lugares.' }, 409);
      }
      return c.json({ confirmationCode: id }, 201);
    } catch (error) {
      if (!d1Error(error, 'UNIQUE constraint failed')) throw error;
      return c.json({ message: 'Ya tienes una reservación activa para este evento.' }, 409);
    }
  });

  app.post('/api/reservations/:id/cancel', async (c) => {
    const user = await currentUser(c);
    if (!user) return c.json({ message: 'Inicia sesión para cancelar.' }, 401);
    const id = c.req.param('id');
    if (!uuid.test(id)) return c.json({ message: 'Código de reservación inválido.' }, 400);
    const code = crypto.randomUUID();
    const [cancelled] = await c.env.DB.batch([
      c.env.DB.prepare(`
        UPDATE reservations SET cancellation_code = ?
        WHERE id = ? AND user_id = ? AND cancellation_code IS NULL
          AND event_id IN (SELECT id FROM events WHERE starts_at > ?)
      `).bind(code, id, user.id, now()),
      c.env.DB.prepare(`
        UPDATE events SET available_seats = available_seats +
          (SELECT seats FROM reservations WHERE cancellation_code = ?)
        WHERE id = (SELECT event_id FROM reservations WHERE cancellation_code = ?)
      `).bind(code, code)
    ]);
    if (!cancelled.meta.changes) return c.json({ message: 'La reservación no está disponible para cancelar.' }, 409);
    return c.json({ cancellationCode: code });
  });

  app.use('/api/admin/*', async (c, next) => {
    const user = await currentUser(c);
    if (!user) return c.json({ message: 'Inicia sesión para continuar.' }, 401);
    if (user.role !== 'admin') return c.json({ message: 'Se requieren permisos de administrador.' }, 403);
    c.set('user', user);
    c.header('Cache-Control', 'no-store');
    await next();
  });
}

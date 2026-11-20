import { sentry } from '@sentry/hono/cloudflare';
import type { ErrorEvent } from '@sentry/cloudflare';
import { BadRequest } from './app.ts';
import type { App, Env } from './app.ts';

// Quita el token de sesión antes de que el evento salga del Worker.
function scrubAuthorization(event: ErrorEvent) {
  const headers = event.request?.headers;
  if (headers) {
    for (const name of Object.keys(headers)) {
      if (name.toLowerCase() === 'authorization' || name.toLowerCase() === 'cookie') delete headers[name];
    }
  }
  return event;
}

export function registerMonitoring(app: App) {
  app.use(sentry(app, (env: Env) => ({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    release: env.SENTRY_RELEASE ?? env.CF_VERSION_METADATA?.id,
    tracesSampleRate: 1.0,
    // Nunca enviar cuerpos HTTP: contienen contraseñas y datos de reservaciones.
    dataCollection: { userInfo: false, httpBodies: [] },
    beforeSend: scrubAuthorization,
    // JSON inválido o demasiado grande es un error del cliente (400), no un bug.
    shouldHandleError: (error) => !(error instanceof BadRequest)
  })));

  // Ruta de prueba para verificar Sentry. Solo existe donde SENTRY_DEBUG_ROUTE=true (Dev).
  app.get('/api/debug/sentry', (c) => {
    if (c.env.SENTRY_DEBUG_ROUTE !== 'true') return c.json({ message: 'Ruta no encontrada.' }, 404);
    throw new Error('Prueba de Sentry desde EventHub');
  });
}

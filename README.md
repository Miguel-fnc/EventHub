# EventHub

Sistema de reservaciones de eventos. El cliente puede consultar próximos eventos, crear su cuenta, reservar lugares y cancelar sus reservaciones.

## Arquitectura

EventHub corre completo en Cloudflare, sin servidores que administrar:

- **Cloudflare Workers** ejecuta la API (`backend/src`, con [Hono](https://hono.dev)) en `/api/*`.
- **Workers Static Assets** sirve el frontend de React compilado con Vite (`frontend/dist`) desde el mismo Worker y el mismo dominio.
- **Cloudflare D1** (SQLite administrado) guarda eventos, usuarios, sesiones y reservaciones. Las migraciones viven en `backend/migrations`.
- **Workers Logs** (observabilidad activada en `wrangler.jsonc`) concentra los logs de la API.
- **GitHub Actions** prueba, despliega a Dev (`develop`) y a Prod (`main`), y revisa la disponibilidad cada 15 minutos.

Hay dos entornos, cada uno con su Worker y su base D1:

| Entorno | Rama      | Worker         | Base D1         |
|---------|-----------|----------------|-----------------|
| Dev     | `develop` | `eventhub-dev` | `eventhub-dev`  |
| Prod    | `main`    | `eventhub`     | `eventhub-prod` |

## Estrategia de ramas

- `main` contiene la versión estable. La liberación se integra mediante un pull request desde `develop`, con revisión y CI en verde. Cada push a `main` despliega a Prod.
- `develop` integra los cambios para la siguiente versión mediante pull requests con CI. Cada push a `develop` despliega a Dev.
- `feature/<issue>-<nombre>` parte de `develop` y vuelve a `develop` mediante un pull request. Usa el número real del issue de GitHub.
- `hotfix/<nombre>` parte de `main` para una corrección urgente. La corrección se integra en `main` y después se incorpora a `develop`.

## Ejecutar en local

Requiere Node.js 24 y npm. No hace falta Docker ni una cuenta de Cloudflare: Wrangler simula el Worker y D1 en tu máquina.

```powershell
cd frontend
npm install
npm run build
cd ../backend
npm install
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Abre <http://localhost:8787>. El Worker sirve el frontend compilado y la API. La base local vive en `backend/.wrangler` y Git la ignora.

Para trabajar en el frontend con recarga en caliente, deja `npm run dev` corriendo en `backend` y, en otra terminal, ejecuta `npm run dev` en `frontend`. Abre <http://localhost:5173>; Vite reenvía `/api` al Worker en el puerto 8787.

Pruebas:

```powershell
npm --prefix backend test          # pruebas unitarias
npm --prefix backend run build     # verificación de tipos
```

Con el Worker local corriendo, la prueba de integración completa es `node infra/smoke.mjs` con `EVENTHUB_URL=http://127.0.0.1:8787` (antes registra `admin@example.test` y promuévelo a admin como se explica abajo).

## Probar una reservación

1. Selecciona **Crear cuenta** y registra un correo con una contraseña de al menos ocho caracteres.
2. Elige un evento con cupo y reserva dos lugares. En **Mis reservaciones** aparecerá un código de confirmación y el evento mostrará dos lugares menos.
3. Selecciona **Cancelar reservación**. Aparecerá el código de cancelación y los dos lugares volverán al catálogo.
4. Cierra sesión y vuelve a entrar para comprobar que la reservación cancelada sigue en tu historial.

Se permite una reservación activa por cliente y evento. Cada sesión dura ocho horas. Si recargas la página, vuelve a iniciar sesión para ver tu historial.

## Administrar eventos

Registra una cuenta normal para administración y promuévela, sustituyendo el correo por el que registraste. Desde `backend`:

```powershell
# Local
npx wrangler d1 execute DB --local --command "UPDATE users SET role = 'admin' WHERE email = 'admin@ejemplo.com';"
# Dev
npx wrangler d1 execute DB --remote --env dev --command "UPDATE users SET role = 'admin' WHERE email = 'admin@ejemplo.com';"
# Prod
npx wrangler d1 execute DB --remote --command "UPDATE users SET role = 'admin' WHERE email = 'admin@ejemplo.com';"
```

El resultado debe indicar `changes: 1`. Cierra sesión y vuelve a entrar. Abre **Administrar** para publicar un evento con fecha futura. Verifica desde otra cuenta que aparece en el catálogo y se puede reservar. El panel permite editar eventos, consultar reservaciones activas y canceladas y eliminar eventos sin historial. El cupo total debe cubrir los lugares ya reservados.

## Despliegue en Cloudflare

### Preparación (una sola vez)

1. Inicia sesión con Wrangler y crea las dos bases D1. Desde `backend`:

   ```powershell
   npx wrangler login
   npx wrangler d1 create eventhub-dev
   npx wrangler d1 create eventhub-prod
   ```

   Copia cada `database_id` que imprime Wrangler en `backend/wrangler.jsonc` (sustituye los `00000000-...`) y súbelo en un PR.

2. En Cloudflare, crea un API token en **My Profile → API Tokens → Create Token** con la plantilla **Edit Cloudflare Workers** y agrega el permiso **Account → D1 → Edit**. Copia también tu **Account ID** (aparece en **Workers & Pages**, panel derecho).

3. En GitHub (**Settings → Secrets and variables → Actions**):
   - Secretos de repositorio: `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`.
   - Variables de repositorio: `DEPLOY_ENABLED=true`, `DEV_URL` y `PROD_URL` (para el monitoreo).
   - En **Settings → Environments**, crea `Dev` y `Prod`. En cada uno agrega la variable `APP_URL` con su URL pública (por ejemplo `https://eventhub-dev.<tu-subdominio>.workers.dev`). En `Prod`, activa **Required reviewers** si quieren aprobación manual antes de cada despliegue.

4. (Opcional) Para usar un dominio propio administrado en Cloudflare, agrega en el Worker **Settings → Domains & Routes → Add → Custom domain**, y actualiza `APP_URL` / `PROD_URL`.

### Pipeline

`.github/workflows/eventhub.yml` corre en cada PR y push:

1. Pruebas unitarias, verificación de tipos y compilación del frontend.
2. Prueba de integración: levanta el Worker con D1 local, registra un admin y ejecuta `infra/smoke.mjs` con el flujo completo de cliente y administración.
3. Si `DEPLOY_ENABLED=true` y la rama es `develop` o `main`: aplica las migraciones pendientes de D1, despliega el Worker con el mismo frontend que pasó las pruebas y verifica `/api/health`.

También se puede desplegar a mano desde `backend` con `npm run deploy:dev` o `npm run deploy:prod`.

Para regresar a una versión anterior: `npx wrangler deployments list` y `npx wrangler rollback [<version-id>]` (agrega `--env dev` para Dev). El rollback no revierte migraciones de D1.

### Monitoreo

- **Logs:** Cloudflare → Workers & Pages → `eventhub` → **Logs**. Los `console.error` de la API aparecen ahí.
- **Métricas:** la pestaña **Metrics** del Worker muestra solicitudes, errores y tiempo de CPU; D1 tiene su propia pestaña de métricas.
- **Disponibilidad:** `.github/workflows/uptime.yml` consulta `/api/health` de Dev y Prod cada 15 minutos. Si falla, GitHub envía un correo de workflow fallido. Para probar la alerta, cambia temporalmente `PROD_URL` a una URL inválida y ejecuta el workflow con **Run workflow**.

Para el reporte, guarda el diagrama, la distribución de actividades y capturas del PR con checks, el despliegue, la alerta de disponibilidad y una reservación desde el dominio público.

# EventHub

Sistema de reservaciones de eventos. El cliente puede consultar próximos eventos, crear su cuenta, reservar lugares y cancelar sus reservaciones.

## Arquitectura

EventHub corre completo en Cloudflare, sin servidores que administrar:

- **Cloudflare Workers** ejecuta la API (`backend/src`, con [Hono](https://hono.dev)) en `/api/*`.
- **Workers Static Assets** sirve el frontend de React compilado con Vite (`frontend/dist`) desde el mismo Worker y el mismo dominio.
- **Cloudflare D1** (SQLite administrado) guarda eventos, usuarios, sesiones y reservaciones. Las migraciones viven en `backend/migrations`.
- **Workers Logs** (observabilidad activada en `wrangler.jsonc`) concentra los logs de la API.
- **Sentry** captura los errores de la API con stack traces legibles, trazas de rendimiento y releases ligadas a cada commit desplegado.
- **GitHub Actions** prueba, despliega a Dev (`develop`) y a Prod (`main`), y revisa la disponibilidad cada 15 minutos.
- **Terraform** (`infra/terraform`) crea y administra las bases D1 de Dev y Prod con el proveedor oficial de Cloudflare.
- **Docker Hub** recibe en cada despliegue la imagen `eventhub`, que corre la app completa en cualquier máquina.

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

Requiere Node.js 24 y npm. No hace falta una cuenta de Cloudflare: Wrangler simula el Worker y D1 en tu máquina. Si prefieres no instalar Node.js, consulta [Ejecutar con Docker](#ejecutar-con-docker).

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

## Ejecutar con Docker

La imagen trae la app completa (API, frontend y una base D1 local) sobre el runtime oficial de Cloudflare. No necesita Node.js ni cuenta de Cloudflare.

```powershell
docker run -d --name eventhub -p 8787:8787 -v eventhub-data:/data <usuario-dockerhub>/eventhub:latest
```

O, desde el repositorio, `docker compose up -d --build`. Abre <http://localhost:8787>. La primera vez aplica las migraciones y carga eventos de ejemplo (desactívalo con `-e SEED_DEMO=false`). Los datos quedan en el volumen `eventhub-data`.

Para promover un admin dentro del contenedor:

```powershell
docker exec eventhub npx wrangler d1 execute DB --local --persist-to /data --command "UPDATE users SET role = 'admin' WHERE email = 'admin@ejemplo.com';"
```

La imagen es para demos, QA y desarrollo. Los entornos Dev y Prod corren en Cloudflare Workers.

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

1. Crea las dos bases D1 con **Terraform**, como se explica en [infra/terraform/README.md](infra/terraform/README.md). Copia los IDs de `terraform output d1_database_ids` en los `database_id` de `backend/wrangler.jsonc` y súbelos en un PR.

2. En Cloudflare, crea un API token en **My Profile → API Tokens → Create Token** con la plantilla **Edit Cloudflare Workers** y agrega el permiso **Account → D1 → Edit**. Copia también tu **Account ID** (aparece en **Workers & Pages**, panel derecho).

3. En GitHub (**Settings → Secrets and variables → Actions**):
   - Secretos de repositorio: `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`.
   - Variables de repositorio: `DEPLOY_ENABLED=true`, `DEV_URL` y `PROD_URL` (para el monitoreo).
   - Docker Hub (service connection): variable `DOCKERHUB_USERNAME` y secreto `DOCKERHUB_TOKEN`, un access token de Docker Hub con permiso **Read & Write**.
   - En **Settings → Environments**, crea `Dev` y `Prod`. En cada uno agrega la variable `APP_URL` con su URL pública (por ejemplo `https://eventhub-dev.<tu-subdominio>.workers.dev`). En `Prod`, activa **Required reviewers** si quieren aprobación manual antes de cada despliegue.

4. (Opcional) Para usar un dominio propio administrado en Cloudflare, agrega en el Worker **Settings → Domains & Routes → Add → Custom domain**, y actualiza `APP_URL` / `PROD_URL`.

### Pipeline

`.github/workflows/eventhub.yml` corre en cada PR y push:

1. Pruebas unitarias, verificación de tipos y compilación del frontend.
2. Prueba de integración: levanta el Worker con D1 local, registra un admin y ejecuta `infra/smoke.mjs` con el flujo completo de cliente y administración.
3. Job `docker`: construye la imagen, la levanta y le corre el mismo smoke test. En `develop` la publica en Docker Hub como `<usuario>/eventhub:dev` y `:<sha>`; en `main`, como `:latest` y `:<sha>`.
4. Si `DEPLOY_ENABLED=true` y la rama es `develop` o `main`: aplica las migraciones pendientes de D1, empaqueta el Worker con source maps, crea la release en Sentry (sube los source maps y asocia los commits), despliega ese mismo bundle con el frontend que pasó las pruebas, verifica `/api/health` y registra el deploy en Sentry.

También se puede desplegar a mano desde `backend` con `npm run deploy:dev` o `npm run deploy:prod`, pero ese despliegue no lleva el DSN ni la release de Sentry: el monitoreo de errores queda apagado hasta el siguiente despliegue desde GitHub Actions.

Para regresar a una versión anterior: `npx wrangler deployments list` y `npx wrangler rollback [<version-id>]` (agrega `--env dev` para Dev). El rollback no revierte migraciones de D1.

### Monitoreo

- **Logs:** Cloudflare → Workers & Pages → `eventhub` → **Logs**. Los `console.error` de la API aparecen ahí.
- **Métricas:** la pestaña **Metrics** del Worker muestra solicitudes, errores y tiempo de CPU; D1 tiene su propia pestaña de métricas.
- **Disponibilidad:** `.github/workflows/uptime.yml` consulta `/api/health` de Dev y Prod cada 15 minutos. Si falla, GitHub envía un correo de workflow fallido. Para probar la alerta, cambia temporalmente `PROD_URL` a una URL inválida y ejecuta el workflow con **Run workflow**.
- **Errores y trazas (Sentry):** el proyecto `eventhub` de Sentry recibe cada error no controlado de la API (respuestas 500) con su stack trace legible, la ruta, la release (`eventhub@<sha del commit>`) y el entorno (`dev` o `production`). También registra trazas de cada petición, incluidas las consultas a D1. Los errores esperados (400, 401, 404, 409) no se envían. Por privacidad, nunca se mandan cuerpos de petición (contraseñas) ni los headers `Authorization` y `Cookie`.

### Sentry

Configuración (una vez), en **Settings → Secrets and variables → Actions → Secrets** del repositorio:

| Secreto | Valor |
|---|---|
| `SENTRY_DSN` | DSN del proyecto: Sentry → **Settings → Projects → eventhub → Client Keys (DSN)** |
| `SENTRY_AUTH_TOKEN` | Token de organización: Sentry → **Settings → Developer Settings → Organization Tokens → Create New Token** |

Sin `SENTRY_DSN` la app no reporta errores; sin `SENTRY_AUTH_TOKEN` el pipeline no crea releases ni sube source maps. En ambos casos el despliegue sigue funcionando.

Para comprobar que funciona, abre `https://eventhub-dev.<subdominio>.workers.dev/api/debug/sentry`. Esa ruta lanza un error a propósito y solo existe en Dev. En segundos aparece en **Sentry → Issues** como *"Prueba de Sentry desde EventHub"*, con `environment: dev`.

Para probarlo en local, crea `backend/.dev.vars` (Git lo ignora) con:

```
SENTRY_DSN="<tu DSN>"
SENTRY_ENVIRONMENT="local"
SENTRY_DEBUG_ROUTE="true"
```

Para el reporte, guarda el diagrama, la distribución de actividades y capturas del PR con checks, el despliegue, la alerta de disponibilidad, el error de prueba en Sentry (con su release y entorno) y una reservación desde el dominio público.

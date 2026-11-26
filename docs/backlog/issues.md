# Backlog de EventHub

## Cómo armar el tablero

1. **Etiquetas:** en el repo entra a **Issues → Labels → New label** y crea:

   | Etiqueta | Color sugerido | Uso |
   |---|---|---|
   | `historia` | `#0E8A16` | Historia de usuario |
   | `backend` | `#1D76DB` | API / Worker / D1 |
   | `frontend` | `#FBCA04` | React |
   | `infra` | `#5319E7` | Cloudflare, Terraform, Docker |
   | `ci-cd` | `#0052CC` | GitHub Actions |
   | `observabilidad` | `#C5DEF5` | Sentry, logs, uptime |
   | `bug` | `#D73A4A` | Error |
   | `docs` | `#BFDADC` | Wiki y documentación |
   | `deuda-tecnica` | `#E99695` | Mejoras internas |

2. **Tablero:** entra a **Projects → New project → Board**, ponle de nombre "EventHub" y deja las columnas **Backlog**, **Todo**, **In Progress** y **Done**.
3. **Issues:** crea cada issue de abajo (**Issues → New issue**), pega el título y la descripción, asígnale sus etiquetas y, en el panel derecho, **Projects → EventHub**. Luego muévelo a su columna.
4. **Issues terminados:** abre su PR y agrega `Closes #<número del issue>` a la descripción; si el PR ya está fusionado, comenta en el issue el link del PR y ciérralo.

---

## Épica 1: Funcionalidad

### #1 · HU-01 Consultar el catálogo de próximos eventos
**Etiquetas:** `historia` `backend` `frontend` · **Columna:** Done

**Como** visitante **quiero** ver los próximos eventos con su fecha, lugar, descripción y lugares disponibles **para** decidir a cuál asistir.

**Criterios de aceptación**
- [x] `GET /api/events` devuelve solo eventos futuros, ordenados por fecha.
- [x] La respuesta muestra lugares disponibles, no el cupo total.
- [x] La portada muestra el catálogo, un estado de carga y un mensaje si no hay eventos.

**PR:** `feature/1-integracion-eventhub` (aplicación base)

---

### #2 · HU-02 Registro e inicio de sesión
**Etiquetas:** `historia` `backend` `frontend` · **Columna:** Done

**Como** cliente **quiero** crear una cuenta e iniciar sesión **para** reservar lugares a mi nombre.

**Criterios de aceptación**
- [x] Registro con correo válido y contraseña de 8 a 128 caracteres; correo duplicado → 409.
- [x] Las contraseñas se guardan con hash PBKDF2 y sal aleatoria.
- [x] El login devuelve un token de sesión que dura 8 horas; credenciales inválidas → 401 sin revelar si el correo existe.
- [x] Cerrar sesión invalida el token.

**PR:** `feature/1-integracion-eventhub`, `feature/migracion-cloudflare`

---

### #3 · HU-03 Reservar lugares en un evento
**Etiquetas:** `historia` `backend` `frontend` · **Columna:** Done

**Como** cliente **quiero** reservar uno o más lugares en un evento **para** asegurar mi asistencia.

**Criterios de aceptación**
- [x] La reservación genera un código de confirmación.
- [x] Descuenta los lugares disponibles de forma atómica.
- [x] Rechaza eventos que ya comenzaron o sin lugares suficientes (409).
- [x] Solo una reservación activa por cliente y evento (409).

**PR:** `feature/1-integracion-eventhub`, `feature/migracion-cloudflare`

---

### #4 · HU-04 Ver y cancelar mis reservaciones
**Etiquetas:** `historia` `backend` `frontend` · **Columna:** Done

**Como** cliente **quiero** ver mi historial de reservaciones y cancelar las que ya no necesito **para** liberar los lugares.

**Criterios de aceptación**
- [x] "Mis reservaciones" muestra activas y canceladas.
- [x] Cancelar genera un código de cancelación y devuelve los lugares al catálogo.
- [x] No se puede cancelar una reservación de un evento que ya comenzó.

**PR:** `feature/1-integracion-eventhub`, `feature/migracion-cloudflare`

---

### #5 · HU-05 Administrador: publicar y editar eventos
**Etiquetas:** `historia` `backend` `frontend` · **Columna:** Done

**Como** administrador **quiero** publicar y editar eventos **para** mantener el catálogo actualizado.

**Criterios de aceptación**
- [x] Solo usuarios con rol `admin` acceden a `/api/admin/*` (401 sin sesión, 403 sin rol).
- [x] Publicar exige título, lugar, fecha futura y cupo válido.
- [x] Al editar, el cupo no puede quedar por debajo de los lugares ya reservados.

**PR:** `feature/1-integracion-eventhub`, `feature/migracion-cloudflare`

---

### #6 · HU-06 Administrador: eliminar eventos y consultar reservaciones
**Etiquetas:** `historia` `backend` `frontend` · **Columna:** Done

**Como** administrador **quiero** ver quién reservó cada evento y eliminar eventos sin historial **para** controlar la asistencia.

**Criterios de aceptación**
- [x] Lista de reservaciones por evento con correo, lugares y estado.
- [x] Solo se eliminan eventos sin reservaciones (409 si tienen historial).

**PR:** `feature/1-integracion-eventhub`, `feature/migracion-cloudflare`

---

### #7 · Frontend: actualizar el texto de la portada
**Etiquetas:** `frontend` · **Columna:** Done

Cambiar el texto de bienvenida de la portada para anunciar la nueva versión en Cloudflare. Sirve además para comprobar el flujo de despliegue Dev → Prod.

**Criterios de aceptación**
- [x] El cambio aparece primero en Dev y, tras el PR de `develop` → `main`, en Prod.

**PR:** `feature/cambio-portada`

---

### #8 · Frontend: aviso de evento agotado y pie de página
**Etiquetas:** `frontend` `historia` · **Columna:** Todo

**Como** visitante **quiero** ver claramente cuándo un evento está agotado **para** no intentar reservarlo.

**Criterios de aceptación**
- [ ] Los eventos con 0 lugares muestran una etiqueta "Agotado" y ocultan el formulario de reservación.
- [ ] Pie de página con el nombre del proyecto y del equipo.
- [ ] Se despliega por el flujo `feature/*` → `develop` (Dev) → `main` (Prod).

---

## Épica 2: Infraestructura

### #9 · Migrar la aplicación de AWS a Cloudflare
**Etiquetas:** `infra` `backend` · **Columna:** Done

Sustituir EC2 + Docker Compose + PostgreSQL por Cloudflare Workers + D1 para simplificar la operación (sin servidores) y el despliegue.

**Criterios de aceptación**
- [x] API reescrita sobre Hono en un Worker; mismas rutas y respuestas.
- [x] Esquema migrado a SQLite (D1) en `backend/migrations`.
- [x] El mismo Worker sirve el frontend con Workers Static Assets.
- [x] El smoke test completo pasa contra el Worker.

**PR:** `feature/migracion-cloudflare`

---

### #10 · Crear las bases D1 de Dev y Prod y configurar Wrangler
**Etiquetas:** `infra` · **Columna:** Done

**Criterios de aceptación**
- [x] Bases `eventhub-dev` y `eventhub-prod` creadas.
- [x] `backend/wrangler.jsonc` con entornos Dev y Prod y sus IDs de D1.
- [x] Primer despliegue manual de ambos Workers verificado en `/api/health`.

**PR:** `feature/cloudflare-cuenta-nueva`

---

### #11 · Infraestructura como código con Terraform
**Etiquetas:** `infra` · **Columna:** Done

**Criterios de aceptación**
- [x] Módulo `infra/terraform` con el proveedor `cloudflare/cloudflare` v5.
- [x] Bases D1 de Dev y Prod administradas con `for_each` y protegidas con `prevent_destroy`.
- [x] Las bases existentes se importan sin recrearse (`imports.tf`).
- [x] `terraform plan` sin cambios después del `apply`.
- [x] Workflow `terraform.yml` valida formato y configuración en cada PR.

**PR:** `feature/terraform-docker`

---

### #12 · Imagen Docker y publicación en Docker Hub
**Etiquetas:** `infra` `ci-cd` · **Columna:** Done

**Criterios de aceptación**
- [x] `Dockerfile` con la app completa (API, frontend y D1 local), sin root y con healthcheck.
- [x] Service connection: variable `DOCKERHUB_USERNAME` y secreto `DOCKERHUB_TOKEN`.
- [x] El pipeline construye y prueba la imagen en cada PR.
- [x] Publica `:dev` desde `develop`, `:latest` desde `main` y `:<sha>` en ambos.

**PR:** `feature/terraform-docker`

---

## Épica 3: CI/CD

### #13 · Pipeline de build con pruebas unitarias e integración
**Etiquetas:** `ci-cd` `backend` `frontend` · **Columna:** Done

**Criterios de aceptación**
- [x] Pruebas unitarias del backend (`npm test`).
- [x] Verificación de tipos del backend y build del frontend.
- [x] Prueba de integración: Worker local con D1 y `infra/smoke.mjs`.
- [x] Corre en cada PR y cada push.

**PR:** `feature/12-despliegue-aws` (pruebas unitarias), `feature/migracion-cloudflare`

---

### #14 · Despliegue continuo a Dev
**Etiquetas:** `ci-cd` · **Columna:** Done

**Criterios de aceptación**
- [x] Cada merge a `develop` aplica migraciones de D1 y despliega `eventhub-dev`.
- [x] Despliega el mismo frontend que pasó las pruebas.
- [x] Verifica `/api/health` después del despliegue.
- [x] GitHub Environment `Dev` con su `APP_URL`.

**PR:** `feature/migracion-cloudflare`

---

### #15 · Despliegue continuo a Prod
**Etiquetas:** `ci-cd` · **Columna:** Done

**Criterios de aceptación**
- [x] Cada merge a `main` despliega `eventhub` con el mismo proceso que Dev.
- [x] GitHub Environment `Prod` con su `APP_URL` (y aprobación opcional con Required reviewers).

**PR:** `feature/migracion-cloudflare`

---

### #16 · Protección de ramas y estrategia de ramas
**Etiquetas:** `ci-cd` `docs` · **Columna:** Done

**Criterios de aceptación**
- [x] Ruleset en `main` (y `develop`): PR obligatorio, sin force push ni borrado.
- [x] Check `build` obligatorio para fusionar.
- [x] Rama por defecto: `develop`.
- [x] Estrategia documentada en el README y la wiki.

---

### #17 · Monitoreo de disponibilidad
**Etiquetas:** `observabilidad` `ci-cd` · **Columna:** Done

**Criterios de aceptación**
- [x] Workflow `uptime.yml` consulta `/api/health` de Dev y Prod cada 15 minutos.
- [x] Si falla, GitHub envía un correo.
- [x] Alerta probada con una URL inválida.

**PR:** `feature/migracion-cloudflare`

---

## Épica 4: Observabilidad

### #18 · Monitoreo de errores y releases con Sentry
**Etiquetas:** `observabilidad` `backend` `ci-cd` · **Columna:** Done

**Criterios de aceptación**
- [x] Errores 500 de la API llegan a Sentry con ruta, entorno (`dev` / `production`) y release (`eventhub@<sha>`).
- [x] No se envían cuerpos de petición ni los headers `Authorization` y `Cookie`; los 4xx esperados se ignoran.
- [x] El pipeline crea la release, sube source maps, asocia commits y registra cada deploy.
- [x] Alerta por correo de errores nuevos.

**PR:** `feature/sentry`

---

### #19 · Bug: "Mis reservaciones" responde 500
**Etiquetas:** `bug` `backend` · **Columna:** Done

Sentry detectó en Dev `TypeError: Cannot read properties of undefined (reading 'idioma')` en `GET /api/reservations` (EVENTHUB-2), introducido por el commit "feat: preferencias de idioma en reservaciones".

**Criterios de aceptación**
- [x] Se elimina el acceso a la propiedad indefinida.
- [x] "Mis reservaciones" vuelve a cargar en Dev.
- [x] El issue de Sentry queda resuelto.

**PR:** `feature/bug-reservaciones` (introdujo el bug), `fix/reservaciones` (corrección)

---

## Épica 5: Documentación y cierre

### #20 · Wiki del proyecto
**Etiquetas:** `docs` · **Columna:** In Progress

**Criterios de aceptación**
- [x] Descripción, stack tecnológico y diagrama de clases.
- [x] Diagramas de infraestructura y de deployment.
- [x] Secciones de Terraform, Docker Hub, pipelines y observabilidad.
- [ ] Capturas de Cloudflare, Docker Hub, GitHub Actions, Terraform y Sentry.

---

### #21 · Backlog y tablero del proyecto
**Etiquetas:** `docs` · **Columna:** In Progress

**Criterios de aceptación**
- [ ] Etiquetas creadas.
- [ ] Issues de todas las historias y tareas, con su épica y estado.
- [ ] Tablero con columnas Backlog / Todo / In Progress / Done.

---

### #22 · Integrar el fork al repositorio original
**Etiquetas:** `docs` `ci-cd` · **Columna:** Backlog

**Criterios de aceptación**
- [ ] PR de `Miguel-fnc/EventHub` → `rencaballero/EventHub`.
- [ ] La dueña del repo original configura secretos, variables y environments para desplegar desde ahí.

---

### #23 · Actualizar las GitHub Actions a Node.js 24
**Etiquetas:** `deuda-tecnica` `ci-cd` · **Columna:** Backlog

GitHub muestra el aviso "Node.js 20 is deprecated" para `actions/checkout`, `actions/setup-node`, `actions/upload-artifact` y `actions/download-artifact`.

**Criterios de aceptación**
- [ ] Actualizar las actions a versiones que corran en Node.js 24.
- [ ] El pipeline completo sigue en verde sin el aviso.

---

### #24 · Pruebas unitarias de autenticación
**Etiquetas:** `deuda-tecnica` `backend` · **Columna:** Backlog

**Criterios de aceptación**
- [ ] Pruebas de `hashPassword` / `verifyPassword` (contraseña correcta, incorrecta y usuario inexistente).
- [ ] Pruebas de `credentials` (correos y contraseñas inválidas).
- [ ] Corren en el job `build`.

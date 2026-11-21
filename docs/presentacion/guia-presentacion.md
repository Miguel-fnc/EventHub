# EventHub · Guía para la presentación

> **¿Hay que levantar el backend para presentar?** No. EventHub corre en **Cloudflare Workers**, que es *serverless*: la app (API + frontend) y la base de datos ya están publicadas y encendidas 24/7 en Cloudflare. No hay servidor que prender ni contenedor que levantar. Solo necesitas un navegador con sesión iniciada en GitHub, Cloudflare y Sentry, y tu computadora con el repositorio para hacer el cambio de código.

| Ambiente | URL |
|---|---|
| Dev | https://eventhub-dev.miguelfnco2.workers.dev |
| Prod | https://eventhub.miguelfnco2.workers.dev |
| Repositorio | https://github.com/Miguel-fnc/EventHub |
| Tablero | https://github.com/users/Miguel-fnc/projects/3 |
| Sentry | https://infra-desarrollo-continuo-rj.sentry.io |
| Docker Hub | https://hub.docker.com/r/miguelfnco/eventhub |

---

# Parte A · Textos para la presentación

## 1. Descripción del proyecto

**EventHub** es un sistema web de reservaciones de eventos.

Tiene dos tipos de usuario:

- **Clientes:** consultan el catálogo de próximos eventos con fecha, lugar y lugares disponibles; crean su cuenta, inician sesión, reservan uno o varios lugares y cancelan sus reservaciones. Cada reservación genera un código de confirmación y cada cancelación un código de cancelación, y pueden ver su historial en *Mis reservaciones*.
- **Administradores:** publican y editan eventos, ajustan el cupo, consultan quién reservó cada evento y eliminan eventos que no tengan reservaciones activas.

Reglas de negocio que el sistema garantiza:

- Una sola reservación activa por cliente y evento.
- No se puede reservar un evento que ya comenzó o que no tiene lugares suficientes; los eventos agotados se muestran como **Agotado**.
- El cupo de un evento nunca puede quedar por debajo de los lugares ya reservados.
- Las reservaciones y cancelaciones son atómicas: los lugares disponibles nunca quedan inconsistentes, aunque dos personas reserven al mismo tiempo.
- Las contraseñas se guardan con hash (PBKDF2 con sal) y las sesiones duran 8 horas.

El proyecto se desarrolló con prácticas de DevOps: backlog en tablero, estrategia de ramas con Pull Requests, integración y despliegue continuo a dos ambientes (Dev y Prod), infraestructura como código, contenedores y monitoreo de aplicaciones (APM).

## 2. Descripción de la tecnología

**Arquitectura en una frase:** un solo Cloudflare Worker sirve el frontend de React y la API, guarda los datos en Cloudflare D1, y GitHub Actions lo prueba y lo despliega a Dev y Prod; Sentry monitorea errores y rendimiento.

| Capa | Tecnología | Para qué |
|---|---|---|
| Frontend | **React 19 + TypeScript + Vite** | Interfaz de una sola página (catálogo, cuenta, reservaciones, panel de administración) |
| Backend | **Cloudflare Workers + Hono + TypeScript** | API REST en `/api/*`, ejecutada en la red global de Cloudflare, sin servidores |
| Base de datos | **Cloudflare D1** (SQLite administrado) | Eventos, usuarios, sesiones y reservaciones; una base por ambiente |
| Hosting del frontend | **Workers Static Assets** | El mismo Worker sirve el frontend compilado, en el mismo dominio que la API |
| CI/CD | **GitHub Actions** | Pruebas unitarias, prueba de integración, build, despliegue a Dev y a Prod con aprobación |
| Despliegue | **Wrangler** (CLI de Cloudflare) | Migraciones de base de datos, empaquetado y publicación del Worker |
| Infraestructura como código | **Terraform** (proveedor oficial de Cloudflare) | Crea y administra las bases D1 de Dev y Prod |
| Contenedores | **Docker + Docker Hub** | Imagen `miguelfnco/eventhub` con la app completa, publicada por el pipeline |
| APM | **Sentry** | Errores con stack trace, trazas de rendimiento por petición (incluidas las consultas a D1) y releases ligadas a cada commit |
| Métricas y logs | **Cloudflare Workers Observability** | Solicitudes, errores, tiempo de CPU y logs de la API |
| Disponibilidad | **GitHub Actions (cron)** | Revisa `/api/health` de Dev y Prod cada 15 minutos |

**¿Por qué Cloudflare?** El proyecto empezó en AWS (EC2, Docker Compose, PostgreSQL). Se migró a Cloudflare para simplificar la operación: no hay servidores que administrar, parchar ni escalar; el despliegue tarda segundos; el plan gratuito cubre el proyecto, y cada ambiente queda aislado con su propio Worker y su propia base de datos.

**Calidad automatizada en cada cambio:**

1. 18 pruebas unitarias del backend (validaciones, hash de contraseñas, tokens de sesión).
2. Verificación de tipos de TypeScript y build del frontend.
3. Prueba de integración: levanta el Worker con una base local y recorre el flujo completo de cliente y administrador (registro, login, reservar, cancelar, publicar, editar y eliminar eventos).
4. Construcción y prueba de la imagen Docker.

## 3. Estrategia de ramas

Usamos una variante de **Git Flow** con tres tipos de rama y Pull Requests obligatorios:

```
feature/<issue>-<nombre> ──PR──▶ develop ──▶ despliegue automático a Dev
fix/<nombre>             ──PR──▶    │
                                    │ PR de liberación (aprobado)
                                    ▼
                                  main   ──▶ despliegue a Prod (con aprobación)
hotfix/<nombre> ──PR──▶ main, y después a develop
```

- **`main`**: la versión estable que corre en **Producción**. Solo recibe cambios por Pull Request desde `develop` (liberaciones) o desde `hotfix/*`.
- **`develop`**: rama de integración y rama por defecto del repositorio. Cada merge despliega automáticamente al ambiente **Dev**.
- **`feature/<issue>-<nombre>`**: una rama por historia o tarea, creada desde `develop`, con el número del issue del tablero (por ejemplo `feature/17-aviso-agotado`). Regresa a `develop` por Pull Request.
- **`fix/<nombre>`**: correcciones no urgentes, mismo flujo que una feature.
- **`hotfix/<nombre>`**: correcciones urgentes en producción; sale de `main`, entra a `main` y después a `develop`.

**Reglas que lo hacen cumplir (Rulesets de GitHub):** `main` y `develop` no aceptan pushes directos; todo cambio entra por Pull Request, con la aprobación de otro integrante y el check `build` en verde. No se permite force push ni borrar esas ramas.

**Trazabilidad:** cada PR dice `Closes #<issue>`; al fusionarlo, el issue se cierra y la tarjeta pasa a *Done* en el tablero. Cada despliegue crea una release en Sentry con los commits que incluye, así que un error en producción se puede rastrear hasta el commit que lo introdujo.

---

# Parte B · Preparación (hazla un día antes)

## B1. Ajustes del repositorio (una sola vez)

Estos ajustes son necesarios para poder mostrar "autorizar el PR" y "aprobar el pipeline a Prod".

**1. Proteger `main` otra vez.** El ruleset actual protege la "rama por defecto", que ahora es `develop`.
1. GitHub → tu repo → **Settings → Rules → Rulesets → Proteger main**.
2. En **Target branches → Add target → Include by pattern**, escribe `main` y agrégalo (deja también *Default branch*, que es `develop`).
3. En **Require a pull request before merging**, sube **Required approvals** a **1**.
4. Marca **Require status checks to pass → Add checks → `build`** (y `docker` si quieres).
5. **Save changes**.

**2. Aprobación manual para Producción.**
1. **Settings → Environments → Prod**.
2. Marca **Required reviewers** y agrega a quien aprobará (tú y/o `diegorosalesro`).
3. Si tú mismo vas a aprobar tus despliegues, deja **desmarcado** *Prevent self-review*.
4. **Save protection rules**.

**3. Quién autoriza el PR.** GitHub no deja que apruebes tu propio PR. Opciones:
- Lo aprueba `diegorosalesro` (ya es colaborador) desde su cuenta durante la demo. **Recomendado.**
- Si nadie más puede, deja *Required approvals* en 0 y "autorizar" es dar **Merge** después de revisar los checks (menciónalo así en la presentación).

## B2. Sesiones abiertas en el navegador

Abre estas pestañas, en este orden, con sesión iniciada:

1. Repositorio en GitHub (pestaña **Pull requests**).
2. **Actions** del repositorio.
3. Dev: https://eventhub-dev.miguelfnco2.workers.dev
4. Prod: https://eventhub.miguelfnco2.workers.dev
5. Sentry → proyecto **eventhub**.
6. Cloudflare → **Workers & Pages → eventhub**.
7. El tablero del proyecto (opcional, para el contexto).

## B3. Ensayo

- Haz el recorrido completo de la Parte C una vez el día anterior.
- Tiempos aproximados: PR checks ~3–5 min (build ~1 min, docker ~3 min), Deploy to Dev ~1–2 min, Deploy to Prod ~1–2 min.
- Ten una cuenta **admin** y una de **cliente** creadas en Dev y en Prod.
- Para que haya datos en APM y métricas, entra a Dev y Prod y navega un poco unos minutos antes de presentar (ver catálogo, iniciar sesión, reservar).

---

# Parte C · Demostración paso a paso

## Paso 1 · Realizar un cambio en el código

En tu computadora, PowerShell en la carpeta del proyecto:

```powershell
git switch develop
git pull
git switch -c feature/demo-presentacion
```

Abre `frontend/src/main.tsx` y cambia el texto de la portada (busca *"Descubre qué está pasando"*), por ejemplo:

```tsx
<p>Descubre qué está pasando y reserva tu lugar. ¡Versión presentada en clase!</p>
```

Guarda (**Ctrl + S**) y sube el cambio:

```powershell
git status                       # debe aparecer frontend/src/main.tsx como modificado
git commit -am "feat: texto de portada para la presentación"
git push -u origin feature/demo-presentacion
```

> Si tu remoto se llama `mio` en lugar de `origin`, usa `git push -u mio feature/demo-presentacion`.

**Qué decir:** "Seguimos la estrategia de ramas: creamos una rama `feature` desde `develop`; nadie sube directo a `develop` ni a `main`."

## Paso 2 · Abrir y autorizar el PR

1. Abre el link que imprime el push (o **Pull requests → New pull request**).
2. **base: `develop`**, **compare: `feature/demo-presentacion`** → **Create pull request**.
3. En la sección de checks verás correr **EventHub / build** y **EventHub / docker**.
4. **Ver las pruebas unitarias:** clic en **Details** junto a `build` → paso **Backend unit tests**. Muestra:
   - la lista de pruebas (`✔ password hashing`, `✔ session tokens`, `✔ credentials validation`…),
   - el resumen `ℹ tests 18 · ℹ pass 18 · ℹ fail 0`.
   - Muestra también el paso **Integration test on a local Worker with D1**, que termina con *"Flujo de cliente y administración verificado."*
5. **Autorizar:** quien revisa (`diegorosalesro`) entra al PR → **Files changed** → **Review changes → Approve → Submit review**.
6. Con checks en verde y la aprobación, da **Merge pull request → Confirm merge**.

**Qué decir:** "El ruleset no deja fusionar sin aprobación ni con las pruebas en rojo."

## Paso 3 · Pipeline en Desarrollo (Dev)

1. Ve a **Actions**. Aparece la ejecución *"Merge pull request #… from …/feature/demo-presentacion"* en la rama `develop`.
2. Ábrela: verás los jobs **build → docker → Deploy to Dev**.
3. Abre **Deploy to Dev** y recorre los pasos:
   - **Apply D1 migrations** (aplica cambios de base de datos pendientes),
   - **Bundle the Worker with source maps**,
   - **Create Sentry release and upload source maps**,
   - **Deploy the Worker**,
   - **Verify health** (consulta `/api/health` del ambiente),
   - **Finalize Sentry release and record the deploy**.
4. **Ver el proyecto en Dev:** abre https://eventhub-dev.miguelfnco2.workers.dev y recarga con **Ctrl + F5**. Aparece el texto nuevo.
5. Abre también https://eventhub.miguelfnco2.workers.dev: **Prod todavía tiene el texto anterior.** Es la prueba de que los ambientes están separados.

## Paso 4 · Aprobar el pipeline a Producción (Prod)

1. **Pull requests → New pull request**: **base: `main`**, **compare: `develop`** → título *"Release: texto de portada"* → **Create pull request**.
2. Espera los checks en verde, pide la aprobación (igual que el paso 2) y da **Merge**.
3. En **Actions**, la ejecución de `main` llega a **Deploy to Prod** y se queda en **Waiting**: *"This workflow is waiting for review"*.
4. Clic en **Review deployments** → marca **Prod** → escribe un comentario (por ejemplo *"Aprobado para producción"*) → **Approve and deploy**.
5. El job corre los mismos pasos que en Dev.
6. **Ver el cambio en Producción:** abre https://eventhub.miguelfnco2.workers.dev y recarga con **Ctrl + F5**. Ya aparece el texto nuevo.

**Qué decir:** "Producción solo cambia con una liberación aprobada; desplegamos exactamente el mismo frontend que pasó las pruebas."

## Paso 5 · APM (Sentry)

### Errores
1. Provoca un error de prueba **en Dev**: abre https://eventhub-dev.miguelfnco2.workers.dev/api/debug/sentry (esa ruta solo existe en Dev).
2. En Sentry → **Issues** → proyecto **eventhub**: aparece *"Error: Prueba de Sentry desde EventHub"* en segundos.
3. Ábrelo y muestra:
   - **Stack trace** apuntando a `src/monitoring.ts` con la línea exacta (gracias a los source maps que sube el pipeline),
   - **Tags**: `environment: dev`, `release: eventhub@<sha del commit>`, `transaction: GET /api/debug/sentry`,
   - **Request**: método y URL (sin el header `Authorization`, por privacidad).
4. Muestra el issue resuelto del bug real que detectamos (**EVENTHUB-2**, *"Cannot read properties of undefined (reading 'idioma')"*), con el commit sospechoso y el PR que lo corrigió.

### Trazas
1. Navega en Prod (ver catálogo, iniciar sesión, reservar).
2. En Sentry → **Explore → Traces**, filtra por proyecto `eventhub` y entorno `production`.
3. Abre una traza, por ejemplo `POST /api/reservations`: muestra la duración total y, dentro, cada **consulta a D1** (`db.query`) con su SQL y su tiempo.

### Mensajes
- **Breadcrumbs:** dentro de cualquier error, la sección *Breadcrumbs* muestra los mensajes y eventos previos (logs de consola, consultas, peticiones).
- **Releases:** Sentry → **Releases** → `eventhub@<sha>`: commits incluidos, deploys a `dev` y `production`, e issues de esa versión.
- **Logs de la API en Cloudflare:** **Workers & Pages → eventhub → Logs** (o **Observability**): cada petición y los mensajes `console.error` de la API (por ejemplo *"Error en EventHub"*), filtrables por fecha, estado y ruta.

## Paso 6 · Métricas en Cloudflare

1. Cloudflare → **Workers & Pages** → **eventhub** (Prod) → pestaña **Metrics**.
2. Selecciona el periodo (últimas 24 h o 7 días).
3. Muestra:
   - **Requests:** solicitudes por periodo y su estado (éxito / error).
   - **CPU:** **CPU time** por invocación (mediana y percentiles). En Workers se mide el tiempo de CPU que usa cada petición, porque no hay un servidor con un porcentaje de CPU fijo.
   - **Errors** y **Wall time** (duración total de cada petición).
4. **Base de datos:** **Storage & Databases → D1 → eventhub-prod → Metrics**: consultas leídas y escritas, filas y tamaño de la base.
5. **Memoria:** Cloudflare Workers es serverless. Cada invocación corre en un *isolate* con un límite de **128 MB** que Cloudflare administra, y el dashboard no muestra una gráfica de uso de memoria como haría con una máquina virtual. Si te piden memoria:
   - Explícalo así: no hay un servidor propio cuyo consumo administrar; Cloudflare escala y aísla cada petición.
   - Y como respaldo, muestra la imagen de Docker Hub corriendo con su consumo de CPU y memoria:

   ```powershell
   docker run -d --name eventhub-demo -p 8787:8787 miguelfnco/eventhub:latest
   docker stats eventhub-demo
   ```

   `docker stats` muestra **CPU %**, **MEM USAGE / LIMIT** y red en vivo. Abre http://localhost:8787 y navega para que se muevan los números. Al terminar: `docker rm -f eventhub-demo`.

---

# Parte D · Plan B

| Si pasa esto… | Haz esto |
|---|---|
| El cambio no aparece en Dev/Prod | Recarga con **Ctrl + F5** o abre una ventana de incógnito (caché del navegador). |
| Un check falla en el PR | Abre **Details**, muestra el error (también es evidencia de que el CI protege), corrige en la misma rama y haz push: los checks corren de nuevo. |
| *Deploy to Prod* no pide aprobación | Revisa **Settings → Environments → Prod → Required reviewers** (Parte B1). |
| No hay botón para aprobar el PR | Lo tiene que aprobar otra cuenta; si no hay, deja *Required approvals* en 0 y fusiona tras revisar los checks. |
| Algo sale mal en Prod | **Rollback:** en `backend`, `npx wrangler deployments list` y `npx wrangler rollback` regresan a la versión anterior en segundos. |
| Sentry no muestra el error de prueba | Espera 30 segundos y recarga **Issues**; revisa que el filtro de entorno incluya `dev`. |
| No hay datos en Metrics | Navega en la app unos minutos antes; amplía el periodo a 7 días. |

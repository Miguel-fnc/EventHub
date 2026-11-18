# EventHub

Sistema de reservaciones de eventos. El cliente puede consultar próximos eventos, crear su cuenta, reservar lugares y cancelar sus reservaciones.

## Estado y próximos pasos

- **Verificado por el equipo en local.** El cliente puede registrarse, iniciar sesión, reservar y cancelar. El equipo confirmó que el administrador puede actualizar eventos y dispone de una cuenta de cliente para comprobar los cambios en el catálogo.
- **Verificado por el equipo con Docker Compose.** EventHub abre en el puerto 8080, permite iniciar sesión y el panel de administrador funciona con una cuenta promovida en la base de Compose.
- **Pendiente en GitHub.** Integrar los cambios locales y verificar la ejecución del workflow de GitHub Actions.

1. **Integrar en GitHub.** Abre un PR vinculado a la historia de administración y comprueba que GitHub Actions compila y ejecuta la prueba de integración.
2. **Desplegar en AWS.** Configura EC2 y Docker Hub, habilita el despliegue, conecta Cloudflare y verifica el monitoreo con CloudWatch. Guarda evidencia del pipeline y de una reservación en el dominio público.

## Estrategia de ramas

- `main` contiene la versión estable. La liberación se integra mediante un pull request desde `develop`, con revisión y CI en verde. El despliegue automático se ejecuta desde `main` una vez habilitado.
- `develop` integra los cambios para la siguiente versión mediante pull requests con CI.
- `feature/<issue>-<nombre>` parte de `develop` y vuelve a `develop` mediante un pull request. Usa el número real del issue de GitHub.
- `hotfix/<nombre>` parte de `main` para una corrección urgente. La corrección se integra en `main` y después se incorpora a `develop`.

El primer pull request integrará la base funcional ya probada en local y con Compose. Debe apuntar a `develop` y referenciar los issues que cubre. En el PR de liberación hacia `main`, usa `Closes #n` solo para los issues que la versión efectivamente resuelve.

## Ejecutar en local

Requiere Node.js 24, npm y Docker con el motor iniciado. Desde la raíz del repositorio, crea la base de datos de desarrollo y carga los eventos de ejemplo.

```powershell
docker run -d --name eventhub-db -e POSTGRES_USER=eventhub -e POSTGRES_PASSWORD=eventhub -e POSTGRES_DB=eventhub -p 127.0.0.1:5432:5432 postgres:17
docker exec eventhub-db pg_isready -U eventhub -d eventhub
```

Espera a que `pg_isready` indique que acepta conexiones antes de cargar el SQL. Si el contenedor ya existe y está detenido, usa `docker start eventhub-db`. La contraseña del ejemplo es para uso local. Desde la raíz, copia los archivos al contenedor para conservar los acentos del SQL.

```powershell
docker cp backend/sql/. eventhub-db:/tmp/
docker exec eventhub-db psql -v ON_ERROR_STOP=1 -U eventhub -d eventhub -f /tmp/001-events.sql -f /tmp/002-reservations.sql -f /tmp/demo-events.sql
```

Si ya tienes el catálogo funcionando, aplica solo la nueva migración desde la raíz.

```powershell
docker cp backend/sql/002-reservations.sql eventhub-db:/tmp/002-reservations.sql
docker exec eventhub-db psql -v ON_ERROR_STOP=1 -U eventhub -d eventhub -f /tmp/002-reservations.sql
```

En una terminal, inicia la API.

```powershell
cd backend
npm install
$env:DATABASE_URL = 'postgresql://eventhub:eventhub@127.0.0.1:5432/eventhub'
npm run dev
```

En otra terminal, desde la raíz, inicia React.

```powershell
cd frontend
npm install
npm run dev
```

Abre <http://localhost:5173>. Vite reenvía `/api/events` a la API en el puerto 3000.

## Probar una reservación

1. Selecciona **Crear cuenta** y registra un correo con una contraseña de al menos ocho caracteres.
2. Elige un evento con cupo y reserva dos lugares. En **Mis reservaciones** aparecerá un código de confirmación y el evento mostrará dos lugares menos.
3. Selecciona **Cancelar reservación**. Aparecerá el código de cancelación y los dos lugares volverán al catálogo.
4. Cierra sesión y vuelve a entrar para comprobar que la reservación cancelada sigue en tu historial.

Se permite una reservación activa por cliente y evento. Cada sesión del servidor dura ocho horas. Si recargas la página, vuelve a iniciar sesión para ver tu historial.

## Administrar eventos

Registra una cuenta normal para administración. Desde una terminal con acceso a PostgreSQL, sustituye el correo por el que registraste y ejecuta:

```powershell
docker exec eventhub-db psql -v ON_ERROR_STOP=1 -U eventhub -d eventhub -c "UPDATE users SET role = 'admin' WHERE email = 'admin@ejemplo.com';"
```

El resultado esperado es `UPDATE 1`. Cierra sesión y vuelve a entrar. Abre **Administrar** para publicar un evento con fecha futura. Verifica desde otra cuenta que aparece en el catálogo y se puede reservar. El panel permite editar eventos, consultar reservaciones activas y canceladas y eliminar eventos sin historial. El cupo total debe cubrir los lugares ya reservados.

## Contenedores y entrega

Crea un archivo local `.env` con `POSTGRES_PASSWORD` y ejecuta `docker compose up -d --build`. Abre <http://localhost:8080> y comprueba <http://localhost:8080/api/health>. Compose crea una base independiente del contenedor `eventhub-db` y aplica las migraciones. Publica el primer evento desde el panel. Para asignar el rol en Compose, usa `docker compose exec -T db psql` con los mismos argumentos del ejemplo anterior.

La arquitectura propuesta usa una EC2 Linux x86-64 con Docker Compose y un volumen persistente para PostgreSQL. En EC2, coloca el archivo `.env` en `~/eventhub`. Configura Cloudflare Tunnel hacia `http://127.0.0.1:8080` con el conector ejecutado en el host. Para el monitoreo, configura la recolección de logs del backend y una alarma de disponibilidad en CloudWatch sobre el endpoint público `/api/health`. Prueba y documenta la alarma antes de la entrega.

El workflow de GitHub Actions compila ambas aplicaciones y prueba la API sobre los contenedores. Para habilitar la publicación en Docker Hub y el despliegue tras un merge a `main`:

1. Crea los repositorios de imágenes `eventhub-frontend` y `eventhub-backend`. Si son privados, configura acceso de lectura en EC2.
2. Configura la variable `DOCKERHUB_USERNAME` y el secreto `DOCKERHUB_TOKEN`.
3. Configura los secretos `DEPLOY_TARGET` (usuario y host de la EC2), `DEPLOY_KEY` y `DEPLOY_KNOWN_HOSTS` con la clave pública verificada del servidor para la validación SSH. El usuario de despliegue necesita acceso a Docker. La conexión SSH debe ser alcanzable desde el runner autorizado.
4. Configura `DEPLOY_ENABLED=true` cuando la EC2 esté preparada. Se publican imágenes con el SHA del commit y se verifica la salud después de actualizarlas.

Para el reporte, guarda el diagrama, la distribución de actividades y capturas del PR con checks, el despliegue, la alarma y una reservación desde el dominio público.

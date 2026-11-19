# Infraestructura de EventHub en AWS

Terraform crea una instancia EC2 Ubuntu 24.04 x86-64 y un grupo de seguridad por entorno. La instancia tiene un disco gp3 cifrado de 24 GiB. El primer arranque instala Docker con Compose y genera la contraseña de PostgreSQL directamente en el host. La base usa el volumen de Docker definido en el proyecto.

Terraform crea una VPC, una subred pública y su ruta a internet para cada entorno. También registra una llave pública SSH en EC2. La llave privada se conserva en la laptop. El grupo de seguridad permite SSH desde los CIDR declarados y los puertos de la aplicación y PostgreSQL quedan internos. El runner de despliegue necesita una salida autorizada.

## Credenciales de AWS Academy

Con el laboratorio iniciado, abre **AWS Details → AWS CLI → Show**. Pega el bloque completo, incluido `[default]` y `aws_session_token`, en `infra/terraform/aws-learner-lab.credentials`. Terraform lee ese archivo y Git lo ignora. Cuando caduque la sesión, sustituye el bloque con las credenciales del laboratorio activo.

## Planificar Dev

Desde PowerShell, genera la llave de Dev si todavía no existe.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.ssh" | Out-Null
if (!(Test-Path "$env:USERPROFILE\.ssh\eventhub-dev")) {
    ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\eventhub-dev"
}
```

En `dev.tfvars`, confirma la región del laboratorio y sustituye `203.0.113.10/32` por tu IPv4 pública con `/32`. El valor `ssh_public_key_path` apunta al archivo `.pub` que acabas de generar.

```powershell
terraform -chdir=infra/terraform init
terraform -chdir=infra/terraform workspace select -or-create dev
terraform -chdir=infra/terraform plan -var-file=dev.tfvars -out=dev.tfplan
```

Revisa la cuenta y región de AWS antes del plan. Aplica el plan cuando hayas confirmado los recursos y su costo.

```powershell
terraform -chdir=infra/terraform apply dev.tfplan
terraform -chdir=infra/terraform output deploy_target
```

Tras conectarte por SSH, espera el aprovisionamiento con `sudo cloud-init status --wait` y comprueba `docker compose version`. Si la instancia se detiene y arranca de nuevo, revisa `deploy_target` antes del siguiente despliegue porque usa la IP pública asignada a EC2.

## Verificar Dev en el navegador

Dev tiene su propia base de datos. Para cargar los tres eventos de demostración si la tabla está vacía, ejecuta en la EC2 desde `~/eventhub`:

```bash
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U eventhub -d eventhub < backend/sql/demo-events.sql
curl -fsS http://127.0.0.1:8080/api/events
```

El despliegue manual de Dev en EC2 respondió con `{"status":"ok"}` en `/api/health`. Para comprobar la interfaz desde la laptop, ejecuta estos comandos en PowerShell desde la raíz del repositorio y deja la terminal abierta.

```powershell
$target = terraform '-chdir=infra/terraform' output -raw deploy_target
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:8081:127.0.0.1:8080 -i "$env:USERPROFILE\.ssh\eventhub-dev" $target
```

Abre <http://localhost:8081>. El acceso por túnel SSH sirve para la verificación manual de Dev. El despliegue automático y la URL pública siguen pendientes.

## Preparar Prod

Repite el procedimiento con el workspace `prod` y un archivo `prod.tfvars` basado en `environment.tfvars.example`. Genera una llave para Prod y actualiza `ssh_public_key_path` en ese archivo. Cada workspace tiene un estado independiente y crea su propia instancia. Conserva los estados fuera de Git y respáldalos. En un equipo que aprovisiona desde varias laptops, acuerden un backend compartido antes de administrar los mismos recursos.

La creación de EC2 prepara el host. La publicación de los contenedores, el túnel de Cloudflare y el monitoreo se configuran después del aprovisionamiento.

# Infraestructura de EventHub (Terraform + Cloudflare)

Este módulo crea y administra las bases de datos **Cloudflare D1** de cada entorno:

| Recurso | Nombre | Entorno |
|---|---|---|
| `cloudflare_d1_database.eventhub["dev"]` | `eventhub-dev` | Dev |
| `cloudflare_d1_database.eventhub["prod"]` | `eventhub-prod` | Prod |

**División de responsabilidades:**
- **Terraform:** recursos persistentes (bases D1). Se aplica a mano cuando cambia la infraestructura.
- **Wrangler + GitHub Actions:** código de los Workers `eventhub-dev` y `eventhub` (API + frontend), migraciones de esquema de D1 y despliegues. La configuración vive en `backend/wrangler.jsonc`, que apunta a estas bases por su ID.

Protecciones: las bases tienen `prevent_destroy`, así que ningún `terraform apply` ni `terraform destroy` puede borrarlas (y sus datos) por accidente.

## Requisitos

- Terraform 1.6 o superior.
- Un API token de Cloudflare con permiso **Account → D1 → Edit**. Sirve el mismo token del pipeline.

## Uso

Desde PowerShell, en la raíz del repositorio:

```powershell
cd infra/terraform
Copy-Item terraform.tfvars.example terraform.tfvars   # revisa el account_id
$env:CLOUDFLARE_API_TOKEN = Read-Host "Token de Cloudflare" -AsSecureString | ConvertFrom-SecureString -AsPlainText
terraform init
terraform plan
terraform apply
terraform output d1_database_ids
```

En Windows PowerShell 5.1, en lugar de la línea del token usa `$env:CLOUDFLARE_API_TOKEN = "<token>"` en una terminal que vayas a cerrar al terminar.

**Primera vez con las bases existentes:** `imports.tf` adopta las dos bases que se crearon con Wrangler. El plan debe decir `2 to import, 0 to add, 0 to change, 0 to destroy`. Si dice `destroy` o `must be replaced`, **no apliques** y revisa la configuración.

**Cuenta nueva desde cero:** borra `imports.tf`, ejecuta `terraform apply` y copia los IDs de `terraform output d1_database_ids` en los `database_id` de `backend/wrangler.jsonc`.

## Estado

El estado (`terraform.tfstate`) se guarda en local y Git lo ignora porque contiene IDs de la cuenta. Para trabajo en equipo se recomienda moverlo a un backend remoto (por ejemplo, Terraform Cloud o un bucket R2 compatible con S3).

## CI

`.github/workflows/terraform.yml` corre en cada PR que toca `infra/terraform`: `terraform fmt -check`, `init` y `validate`.

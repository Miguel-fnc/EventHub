# Infraestructura de EventHub en Cloudflare.
#
# Terraform administra los recursos persistentes (bases de datos D1 de Dev y Prod).
# El código de los Workers (eventhub-dev y eventhub) lo despliega Wrangler desde
# GitHub Actions usando backend/wrangler.jsonc, que apunta a estas bases por su ID.

resource "cloudflare_d1_database" "eventhub" {
  for_each = var.environments

  account_id = var.account_id
  name       = "${var.project}-${each.key}"

  # Valor actual de Cloudflare. Declararlo evita un falso cambio en cada plan
  # (el proveedor v5 lo trata como opcional + calculado).
  read_replication = {
    mode = "disabled"
  }

  lifecycle {
    # Reemplazar una base D1 borra todos sus datos: Terraform se niega a destruirlas.
    prevent_destroy = true
    # La ubicación solo se usa al crear la base; no debe provocar un reemplazo después.
    ignore_changes = [primary_location_hint, jurisdiction]
  }
}

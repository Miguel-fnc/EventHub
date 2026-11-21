# Las bases D1 se crearon antes con Wrangler. Estos bloques las adoptan en el estado de
# Terraform sin recrearlas (el primer `terraform apply` solo las importa).
#
# En una cuenta nueva, borra este archivo: Terraform creará las bases desde cero y
# `terraform output` dará los IDs que van en backend/wrangler.jsonc.

import {
  to = cloudflare_d1_database.eventhub["dev"]
  id = "${var.account_id}/78478784-65cb-46e2-ad65-5918c577fab2"
}

import {
  to = cloudflare_d1_database.eventhub["prod"]
  id = "${var.account_id}/28547794-0742-4bd0-b8b8-901d53822315"
}

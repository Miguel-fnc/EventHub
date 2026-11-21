output "d1_database_ids" {
  description = "IDs de las bases D1 por entorno. Van en database_id de backend/wrangler.jsonc."
  value       = { for env, db in cloudflare_d1_database.eventhub : env => db.uuid }
}

output "d1_database_names" {
  description = "Nombres de las bases D1 por entorno."
  value       = { for env, db in cloudflare_d1_database.eventhub : env => db.name }
}

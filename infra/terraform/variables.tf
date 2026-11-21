variable "account_id" {
  description = "ID de la cuenta de Cloudflare (Workers & Pages → panel derecho, o `npx wrangler whoami`)."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f]{32}$", var.account_id))
    error_message = "account_id debe ser un ID de cuenta de Cloudflare de 32 caracteres hexadecimales."
  }
}

variable "project" {
  description = "Prefijo de los recursos."
  type        = string
  default     = "eventhub"
}

variable "environments" {
  description = "Entornos a crear. La clave es el sufijo de la base D1 (eventhub-<clave>)."
  type        = set(string)
  default     = ["dev", "prod"]
}

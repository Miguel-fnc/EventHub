terraform {
  required_version = ">= 1.6"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

# El token se lee de la variable de entorno CLOUDFLARE_API_TOKEN (nunca se escribe en el código).
provider "cloudflare" {}

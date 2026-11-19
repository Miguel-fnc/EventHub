variable "aws_region" {
  description = "AWS region for EventHub."
  type        = string
}

variable "ssh_public_key_path" {
  description = "Path to an OpenSSH public key file."
  type        = string
}

variable "ssh_allowed_cidrs" {
  description = "Approved IPv4 CIDRs for SSH, such as an admin workstation or runner with a fixed egress IP."
  type        = list(string)

  validation {
    condition = length(var.ssh_allowed_cidrs) > 0 && alltrue([
      for cidr in var.ssh_allowed_cidrs : can(cidrnetmask(cidr)) && try(tonumber(split("/", cidr)[1]) >= 24, false)
    ])
    error_message = "Provide at least one IPv4 CIDR with a /24 or narrower prefix. Use /32 for a single address."
  }
}

variable "instance_type" {
  description = "x86-64 EC2 instance type for the Docker Compose stack."
  type        = string
  default     = "t3.small"
}

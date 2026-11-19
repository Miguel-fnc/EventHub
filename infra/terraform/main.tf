terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region                   = var.aws_region
  profile                  = "default"
  shared_credentials_files = ["${path.module}/aws-learner-lab.credentials"]

  default_tags {
    tags = {
      Project     = "EventHub"
      Environment = terraform.workspace
      ManagedBy   = "Terraform"
    }
  }
}

resource "aws_vpc" "eventhub" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
}

resource "aws_subnet" "deployment" {
  vpc_id     = aws_vpc.eventhub.id
  cidr_block = "10.42.1.0/24"
}

resource "aws_internet_gateway" "eventhub" {
  vpc_id = aws_vpc.eventhub.id
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.eventhub.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.eventhub.id
  }
}

resource "aws_route_table_association" "deployment" {
  subnet_id      = aws_subnet.deployment.id
  route_table_id = aws_route_table.public.id
}

resource "aws_key_pair" "deployment" {
  key_name   = "eventhub-${terraform.workspace}"
  public_key = trimspace(file(pathexpand(var.ssh_public_key_path)))
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

resource "aws_security_group" "eventhub" {
  name_prefix = "eventhub-${terraform.workspace}-"
  description = "EventHub deployment host"
  vpc_id      = aws_vpc.eventhub.id
}

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  for_each = toset(var.ssh_allowed_cidrs)

  security_group_id = aws_security_group.eventhub.id
  description       = "SSH from approved deployment or admin network"
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
}

resource "aws_vpc_security_group_egress_rule" "internet" {
  security_group_id = aws_security_group.eventhub.id
  description       = "Package updates, Docker Hub and Cloudflare Tunnel"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_instance" "eventhub" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.deployment.id
  associate_public_ip_address = true
  vpc_security_group_ids      = [aws_security_group.eventhub.id]
  key_name                    = aws_key_pair.deployment.key_name
  user_data                   = replace(file("${path.module}/bootstrap.sh"), "\r\n", "\n")

  depends_on = [aws_route_table_association.deployment, aws_vpc_security_group_egress_rule.internet]

  metadata_options {
    http_tokens = "required"
  }

  root_block_device {
    encrypted   = true
    volume_type = "gp3"
    volume_size = 24
  }

  tags = {
    Name = "eventhub-${terraform.workspace}"
  }

  lifecycle {
    precondition {
      condition     = contains(["dev", "prod"], terraform.workspace)
      error_message = "Select the dev or prod Terraform workspace before planning."
    }
    ignore_changes = [ami]
  }
}

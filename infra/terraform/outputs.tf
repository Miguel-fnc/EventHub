output "instance_id" {
  value = aws_instance.eventhub.id
}

output "public_ip" {
  value = aws_instance.eventhub.public_ip
}

output "deploy_target" {
  description = "SSH destination for this environment."
  value       = "ubuntu@${aws_instance.eventhub.public_ip}"
}

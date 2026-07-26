variable "IMAGE" {
  default = "t3code-gateway"
}

variable "VERSION" {
  default = "0.0.0-dev"
}

target "image" {
  context = "."
  dockerfile = "Containerfile"
  platforms = ["linux/amd64", "linux/arm64"]
  tags = ["${IMAGE}:${VERSION}"]
  cache-from = ["type=gha,scope=image"]
  cache-to = ["type=gha,scope=image,mode=max"]
}

group "default" {
  targets = ["image"]
}

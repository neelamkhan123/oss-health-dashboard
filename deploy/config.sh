#!/usr/bin/env bash
# Shared settings for deploy/up.sh and deploy/down.sh.
# Override any of these in your environment rather than editing this file.

: "${AWS_REGION:=eu-west-2}"
: "${SUBNET_ID:=subnet-057da3d50c470bb90}"   # eu-west-2a, default VPC
: "${VPC_ID:=vpc-0ffc29fd5ef9a90fa}"

# t3.small, not t3.micro: the node now hosts Postgres and Redis as well as
# the three app pods, and 1 GB does not fit that. Because the stack only
# runs while you are demonstrating it, the difference is about a penny an
# hour — the instance size stopped mattering the moment it stopped being
# always-on.
: "${INSTANCE_TYPE:=t3.small}"
: "${VOLUME_SIZE:=20}"

: "${STACK:=oss-dashboard}"
: "${KEY_NAME:=${STACK}-key}"
: "${KEY_FILE:=$HOME/.ssh/${STACK}-key.pem}"
: "${SG_NAME:=${STACK}-sg}"
: "${NODE_PORT:=30080}"

# Set DOCKERHUB_USER in your environment; both images are pulled from here.
: "${DOCKERHUB_USER:?set DOCKERHUB_USER to your Docker Hub username}"
: "${API_IMAGE:=${DOCKERHUB_USER}/oss-dashboard-api:latest}"
: "${WEB_IMAGE:=${DOCKERHUB_USER}/oss-dashboard-web:latest}"

export AWS_DEFAULT_REGION="$AWS_REGION"

say()  { printf '\033[36m›\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

instance_id() {
  aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=${STACK}-server" \
              "Name=instance-state-name,Values=pending,running" \
    --query 'Reservations[0].Instances[0].InstanceId' --output text 2>/dev/null
}

instance_ip() {
  aws ec2 describe-instances --instance-ids "$1" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' --output text 2>/dev/null
}

ssh_node() {
  ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
      -o LogLevel=ERROR "ubuntu@${1}" "${@:2}"
}

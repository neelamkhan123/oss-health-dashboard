#!/usr/bin/env bash
# Shared settings for deploy/up.sh and deploy/down.sh.
# Override any of these in your environment rather than editing this file.

# Local, gitignored overrides — the natural home for DUCKDNS_TOKEN and
# DOCKERHUB_USER so they don't have to live in your shell profile.
if [ -f "$(dirname "${BASH_SOURCE[0]}")/deploy.env" ]; then
  set -a; . "$(dirname "${BASH_SOURCE[0]}")/deploy.env"; set +a
fi

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

# ── optional: a stable hostname and HTTPS ───────────────────────────────
# Set DUCKDNS_SUBDOMAIN and DUCKDNS_TOKEN (free, from duckdns.org) and the
# stack comes up at https://<subdomain>.duckdns.org with a real certificate,
# instead of http://<changing-ip>:30080. That is what makes OAuth possible:
# GitHub and Google need a callback URL that does not move.
: "${DUCKDNS_SUBDOMAIN:=}"
: "${DUCKDNS_TOKEN:=}"
# Let's Encrypt uses this only to warn about expiry. Optional.
: "${ACME_EMAIL:=}"

# Caddy's certificates and ACME account key, carried between deployments.
# Without this every deploy is a fresh issuance, and Let's Encrypt allows
# only five identical certificates per week — five deploys and you are
# locked out until the window rolls.
: "${CADDY_DATA_ARCHIVE:=deploy/.caddy-data.tar.gz}"

# True when a hostname is configured, i.e. use HTTPS rather than a bare IP.
use_https() { [ -n "$DUCKDNS_SUBDOMAIN" ] && [ -n "$DUCKDNS_TOKEN" ]; }

public_host() {
  if use_https; then
    echo "https://${DUCKDNS_SUBDOMAIN}.duckdns.org"
  else
    echo "http://${1}:${NODE_PORT}"
  fi
}

# Set DOCKERHUB_USER in your environment; both images are pulled from here.
: "${DOCKERHUB_USER:?set DOCKERHUB_USER to your Docker Hub username}"

# Which architectures the images are built for. Both by default, so one
# :latest runs on Oracle's Ampere (arm64) and on x86 hosts alike — a mismatch
# here is not a subtle failure, the image pulls fine and the container dies
# immediately with `exec format error`. Narrow it to a single platform if you
# want faster builds and know where you are deploying.
: "${TARGET_ARCH:=linux/arm64,linux/amd64}"
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

# Ubuntu images use the `ubuntu` user on both AWS and Oracle.
: "${SSH_USER:=ubuntu}"

ssh_node() {
  ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
      -o LogLevel=ERROR "${SSH_USER}@${1}" "${@:2}"
}

scp_node() {
  scp -q -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
      -o LogLevel=ERROR "${@:1:$#-1}" "${SSH_USER}@${!#}"
}

# Oracle's Ubuntu images ship an iptables ruleset that rejects everything
# except ssh, and — the part that actually breaks Kubernetes — rejects the
# whole FORWARD chain, which is where pod-to-pod and service traffic goes.
# The cloud security list is the real perimeter here; these rules only need
# to stop fighting it. Idempotent, and never touches the ssh rule, so it
# cannot lock you out of the box it is running on.
prepare_host_firewall() {
  local ip="$1"
  say "opening host firewall for http and k3s"
  ssh_node "$ip" 'set -e
command -v iptables >/dev/null || exit 0

add_input() {  # insert before the trailing REJECT, only if not already there
  sudo iptables -C INPUT "$@" -j ACCEPT 2>/dev/null ||     sudo iptables -I INPUT 5 "$@" -j ACCEPT
}

add_input -p tcp -m state --state NEW -m tcp --dport 80      # http / ACME challenge
add_input -p tcp -m state --state NEW -m tcp --dport 443     # https
add_input -p tcp -m state --state NEW -m tcp --dport 30080   # NodePort, when used directly
add_input -p udp --dport 8472                                # flannel vxlan
add_input -p tcp -m state --state NEW -m tcp --dport 10250   # kubelet
add_input -s 10.42.0.0/16                                    # k3s pod cidr
add_input -s 10.43.0.0/16                                    # k3s service cidr

# k3s installs its own FORWARD rules; the blanket REJECT in front of them
# silently drops every packet between pods.
while sudo iptables -C FORWARD -j REJECT --reject-with icmp-host-prohibited 2>/dev/null; do
  sudo iptables -D FORWARD -j REJECT --reject-with icmp-host-prohibited
done

command -v netfilter-persistent >/dev/null && sudo netfilter-persistent save >/dev/null 2>&1 || true'
  ok "host firewall ready"
}

# Install k3s on a host that does not already have it. AWS does this through
# user-data at launch; a hand-provisioned box (Oracle, or anything else with
# ssh) needs it done over the wire instead.
ensure_k3s() {
  local ip="$1"
  if ssh_node "$ip" "test -f /etc/rancher/k3s/k3s.yaml" 2>/dev/null; then
    ok "k3s already installed"
    return
  fi
  say "installing k3s (one minute or so)"
  ssh_node "$ip" 'set -e
if ! swapon --show | grep -q .; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
fi
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--write-kubeconfig-mode 644 --disable traefik" sh -
mkdir -p ~/.kube && sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER ~/.kube/config
grep -q KUBECONFIG ~/.bashrc || echo "export KUBECONFIG=~/.kube/config" >> ~/.bashrc'
  ok "k3s installed"
}

# Substitute the manifests for this deployment, ship them, and apply them in
# dependency order. Shared by the AWS and the bring-your-own-host paths so
# the two cannot drift apart.
ship_and_apply() {
  local ip="$1" host="$2"
  say "copying manifests"
  local tmp; tmp=$(mktemp -d)
  cp k8s/*.yaml "$tmp/"
  sed -i.bak "s|REPLACE_ME_DOCKERHUB_USER/oss-dashboard-api|${API_IMAGE%:*}|g" "$tmp"/*.yaml
  sed -i.bak "s|REPLACE_ME_DOCKERHUB_USER/oss-dashboard-web|${WEB_IMAGE%:*}|g" "$tmp"/*.yaml
  sed -i.bak "s|http://REPLACE_ME_HOST|${host}|g" "$tmp"/configmap.yaml
  if use_https; then
    # A Secure cookie is only sent over HTTPS, so this flips with the scheme —
    # setting it wrongly in either direction silently breaks every login.
    sed -i.bak "s|COOKIE_SECURE: \"false\"|COOKIE_SECURE: \"true\"|" "$tmp"/configmap.yaml
    sed -i.bak "s|REPLACE_ME_DOMAIN|${DUCKDNS_SUBDOMAIN}.duckdns.org|" "$tmp"/caddy.yaml
    sed -i.bak "s|REPLACE_ME_ACME_EMAIL|${ACME_EMAIL:-admin@${DUCKDNS_SUBDOMAIN}.duckdns.org}|" "$tmp"/caddy.yaml
  else
    rm -f "$tmp"/caddy.yaml
  fi
  rm -f "$tmp"/*.bak
  scp_node "$tmp"/*.yaml "${ip}:~/"
  rm -rf "$tmp"

  say "applying config and data tier"
  ssh_node "$ip" 'export KUBECONFIG=~/.kube/config
kubectl apply -f secret.yaml -f configmap.yaml -f postgres.yaml -f redis.yaml
kubectl rollout status statefulset/postgres --timeout=300s
kubectl rollout status deployment/redis --timeout=120s'

  say "running migrations"
  ssh_node "$ip" 'export KUBECONFIG=~/.kube/config
kubectl delete job migrate --ignore-not-found >/dev/null
kubectl apply -f migrate-job.yaml
kubectl wait --for=condition=complete job/migrate --timeout=300s
kubectl logs job/migrate | tail -5'

  say "starting the application"
  ssh_node "$ip" 'export KUBECONFIG=~/.kube/config
kubectl apply -f deployment.yaml -f web.yaml
kubectl rollout status deployment/api --timeout=300s
kubectl rollout status deployment/web --timeout=180s'
}

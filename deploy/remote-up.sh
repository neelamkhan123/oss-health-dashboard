#!/usr/bin/env bash
# Deploy to a machine you already have — an Oracle Cloud Always Free VM, or
# anything else reachable over ssh with a public IP.
#
# The difference from deploy/up.sh is what it does NOT do: it creates no
# infrastructure and destroys none. The host is long-lived, so Postgres keeps
# its data between deploys, sessions survive, and there is no hourly cost to
# remember to stop. Run it as often as you like; it is idempotent.
#
# Required:
#   REMOTE_HOST   public IP or hostname of the machine
#   KEY_FILE      ssh private key for it
#   DOCKERHUB_USER
# Optional (strongly recommended — see deploy/deploy.env.example):
#   DUCKDNS_SUBDOMAIN + DUCKDNS_TOKEN   for a stable name and real HTTPS
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/config.sh

: "${REMOTE_HOST:?set REMOTE_HOST to the public IP or hostname of the machine}"
[ -f "$KEY_FILE" ] || die "no ssh key at $KEY_FILE — set KEY_FILE to the key for $REMOTE_HOST"
[ -f k8s/secret.yaml ] || die "k8s/secret.yaml missing — cp k8s/secret.example.yaml k8s/secret.yaml and fill it in"

IP="$REMOTE_HOST"

say "checking ssh to $IP"
ssh_node "$IP" true 2>/dev/null || die "cannot ssh to ${SSH_USER}@${IP} with $KEY_FILE"
ok "connected"

# Arm64 is the default because Oracle's Always Free shape is Ampere. A
# mismatch here is not subtle — the pod pulls the image and dies immediately
# with `exec format error` — so it is worth failing loudly and early.
REMOTE_ARCH=$(ssh_node "$IP" 'uname -m' | tr -d '\r\n')
case "$REMOTE_ARCH" in
  aarch64|arm64) EXPECTED="linux/arm64" ;;
  x86_64|amd64)  EXPECTED="linux/amd64" ;;
  *)             EXPECTED="" ;;
esac
if [ -n "$EXPECTED" ] && [[ ",${TARGET_ARCH}," != *",${EXPECTED},"* ]]; then
  die "host is $REMOTE_ARCH but the images were built for $TARGET_ARCH.
    Rebuild with: TARGET_ARCH=$EXPECTED task deploy:images
    (or set TARGET_ARCH=$EXPECTED in deploy/deploy.env)"
fi
ok "architecture matches ($REMOTE_ARCH)"

ensure_k3s "$IP"

if use_https; then
  say "pointing ${DUCKDNS_SUBDOMAIN}.duckdns.org at $IP"
  RESP=$(curl -fsS "https://www.duckdns.org/update?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip=${IP}" || echo "KO")
  [ "$RESP" = "OK" ] || die "DuckDNS update failed (${RESP}) — check DUCKDNS_SUBDOMAIN and DUCKDNS_TOKEN"
  ok "dns updated"
fi

HOST=$(public_host "$IP")
ship_and_apply "$IP" "$HOST"

if use_https; then
  # No certificate archive dance here, unlike the ephemeral AWS path: this
  # host stays up, so Caddy's PersistentVolumeClaim keeps the certificate
  # across redeploys on its own and renewals just happen.
  say "starting caddy (obtains the certificate on first run)"
  ssh_node "$IP" 'export KUBECONFIG=~/.kube/config
kubectl apply -f caddy.yaml
kubectl rollout status deployment/caddy --timeout=180s'
  say "waiting for the certificate"
  for i in $(seq 1 30); do
    curl -fsS "${HOST}/health" >/dev/null 2>&1 && break
    [ "$i" = 30 ] && warn "no certificate yet — ssh in and check: kubectl logs deployment/caddy"
    sleep 5
  done
fi

say "checking ${HOST}/health"
for i in $(seq 1 20); do
  curl -fsS "${HOST}/health" >/dev/null 2>&1 && break
  [ "$i" = 20 ] && warn "health check never passed — ssh in and run: kubectl get pods"
  sleep 3
done

echo
ok "live at $HOST"
echo "   ssh   ssh -i $KEY_FILE ${SSH_USER}@${IP}"
echo "   pods  ssh -i $KEY_FILE ${SSH_USER}@${IP} 'kubectl get pods'"
if ! use_https; then
  echo
  echo "   No DUCKDNS_SUBDOMAIN set, so this is plain HTTP on a bare IP and"
  echo "   OAuth sign-in cannot work. See deploy/deploy.env.example."
fi
echo
ok "nothing here bills by the hour — this host is free and stays up"

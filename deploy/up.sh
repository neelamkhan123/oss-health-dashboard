#!/usr/bin/env bash
# Bring the whole stack up on a fresh EC2 instance, from nothing to a URL.
#
# Everything runs inside k3s on one instance: Postgres, Redis, the API, the
# Celery worker and beat, and nginx serving the frontend. No RDS, no
# ElastiCache, no CloudFront — those are the parts that cost money on an
# account without the classic free tier.
#
# Safe to re-run: it reuses an instance that is already up.
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/config.sh

[ -f k8s/secret.yaml ] || die "k8s/secret.yaml missing — cp k8s/secret.example.yaml k8s/secret.yaml and fill it in"

# ── key pair ────────────────────────────────────────────────────────────
if ! aws ec2 describe-key-pairs --key-names "$KEY_NAME" >/dev/null 2>&1; then
  say "creating key pair $KEY_NAME"
  aws ec2 create-key-pair --key-name "$KEY_NAME" \
    --query KeyMaterial --output text > "$KEY_FILE"
  chmod 400 "$KEY_FILE"
  ok "private key saved to $KEY_FILE"
fi
[ -f "$KEY_FILE" ] || die "$KEY_FILE is missing but the key pair exists in AWS — delete the key pair and re-run"

# ── security group ──────────────────────────────────────────────────────
SG=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=$SG_NAME" \
      --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo "None")
if [ "$SG" = "None" ] || [ -z "$SG" ]; then
  say "creating security group $SG_NAME"
  SG=$(aws ec2 create-security-group --group-name "$SG_NAME" \
        --description "$STACK ephemeral k3s node" --vpc-id "$VPC_ID" \
        --query GroupId --output text)
fi

MY_IP=$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')
# Authorising an existing rule is an error, not a no-op, so both are best-effort.
aws ec2 authorize-security-group-ingress --group-id "$SG" \
  --protocol tcp --port 22 --cidr "${MY_IP}/32" >/dev/null 2>&1 || true
aws ec2 authorize-security-group-ingress --group-id "$SG" \
  --protocol tcp --port "$NODE_PORT" --cidr 0.0.0.0/0 >/dev/null 2>&1 || true
if use_https; then
  # 80 is not optional even though the site is HTTPS: it is where ACME's
  # HTTP-01 challenge arrives, and where Caddy redirects visitors from.
  for port in 80 443; do
    aws ec2 authorize-security-group-ingress --group-id "$SG" \
      --protocol tcp --port "$port" --cidr 0.0.0.0/0 >/dev/null 2>&1 || true
  done
fi
ok "security group $SG (ssh from ${MY_IP}/32, app on :$NODE_PORT)"

# ── instance ────────────────────────────────────────────────────────────
ID=$(instance_id)
if [ "$ID" = "None" ] || [ -z "$ID" ]; then
  AMI=$(aws ssm get-parameters \
    --names /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
    --query 'Parameters[0].Value' --output text)
  say "launching $INSTANCE_TYPE from $AMI"
  # k3s installs via user-data so it is ready by the time SSH is, rather
  # than adding two minutes to every deploy.
  ID=$(aws ec2 run-instances \
        --image-id "$AMI" --instance-type "$INSTANCE_TYPE" \
        --key-name "$KEY_NAME" --security-group-ids "$SG" --subnet-id "$SUBNET_ID" \
        --associate-public-ip-address \
        --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=${VOLUME_SIZE},VolumeType=gp3}" \
        --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${STACK}-server}]" \
        --user-data '#!/bin/bash
set -e
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo "/swapfile none swap sw 0 0" >> /etc/fstab
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--write-kubeconfig-mode 644 --disable traefik" sh -
mkdir -p /home/ubuntu/.kube
cp /etc/rancher/k3s/k3s.yaml /home/ubuntu/.kube/config
chown -R ubuntu:ubuntu /home/ubuntu/.kube
echo "export KUBECONFIG=/home/ubuntu/.kube/config" >> /home/ubuntu/.bashrc
touch /tmp/k3s-ready' \
        --query 'Instances[0].InstanceId' --output text)
  aws ec2 wait instance-running --instance-ids "$ID"
  ok "instance $ID running"
else
  ok "reusing instance $ID"
fi

IP=$(instance_ip "$ID")
say "waiting for ssh on $IP"
for i in $(seq 1 40); do
  ssh_node "$IP" true 2>/dev/null && break
  [ "$i" = 40 ] && die "ssh never came up — check the security group and your IP"
  sleep 5
done

# ── DNS, before any certificate is requested ────────────────────────────
if use_https; then
  say "pointing ${DUCKDNS_SUBDOMAIN}.duckdns.org at $IP"
  RESP=$(curl -fsS "https://www.duckdns.org/update?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip=${IP}" || echo "KO")
  [ "$RESP" = "OK" ] || die "DuckDNS update failed (${RESP}) — check DUCKDNS_SUBDOMAIN and DUCKDNS_TOKEN"
  ok "dns updated"
fi

say "waiting for k3s"
for i in $(seq 1 60); do
  ssh_node "$IP" "test -f /tmp/k3s-ready" 2>/dev/null && break
  [ "$i" = 60 ] && die "k3s never finished installing — ssh in and check /var/log/cloud-init-output.log"
  sleep 5
done
ok "k3s ready"

# ── ship the manifests ──────────────────────────────────────────────────
say "copying manifests"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
cp k8s/*.yaml "$TMP/"
sed -i.bak "s|REPLACE_ME_DOCKERHUB_USER/oss-dashboard-api|${API_IMAGE%:*}|g" "$TMP"/*.yaml
sed -i.bak "s|REPLACE_ME_DOCKERHUB_USER/oss-dashboard-web|${WEB_IMAGE%:*}|g" "$TMP"/*.yaml
HOST=$(public_host "$IP")
sed -i.bak "s|http://REPLACE_ME_HOST|${HOST}|g" "$TMP"/configmap.yaml
if use_https; then
  # A Secure cookie is only sent over HTTPS, so this flips with the scheme —
  # setting it wrongly in either direction silently breaks every login.
  sed -i.bak "s|COOKIE_SECURE: \"false\"|COOKIE_SECURE: \"true\"|" "$TMP"/configmap.yaml
  sed -i.bak "s|REPLACE_ME_DOMAIN|${DUCKDNS_SUBDOMAIN}.duckdns.org|" "$TMP"/caddy.yaml
  sed -i.bak "s|REPLACE_ME_ACME_EMAIL|${ACME_EMAIL:-admin@${DUCKDNS_SUBDOMAIN}.duckdns.org}|" "$TMP"/caddy.yaml
else
  rm -f "$TMP"/caddy.yaml
fi
rm -f "$TMP"/*.bak
scp -q -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    -o LogLevel=ERROR "$TMP"/*.yaml "ubuntu@${IP}:~/"

# ── apply, in dependency order ──────────────────────────────────────────
say "applying config and data tier"
ssh_node "$IP" 'export KUBECONFIG=~/.kube/config
kubectl apply -f secret.yaml -f configmap.yaml -f postgres.yaml -f redis.yaml
kubectl rollout status statefulset/postgres --timeout=180s
kubectl rollout status deployment/redis --timeout=120s'

say "running migrations"
ssh_node "$IP" 'export KUBECONFIG=~/.kube/config
kubectl delete job migrate --ignore-not-found >/dev/null
kubectl apply -f migrate-job.yaml
kubectl wait --for=condition=complete job/migrate --timeout=240s
kubectl logs job/migrate | tail -5'

say "starting the application"
ssh_node "$IP" 'export KUBECONFIG=~/.kube/config
kubectl apply -f deployment.yaml -f web.yaml
kubectl rollout status deployment/api --timeout=180s
kubectl rollout status deployment/web --timeout=120s'

if use_https; then
  # Put yesterday's certificates back before Caddy starts, so it renews an
  # existing one instead of asking Let's Encrypt for a new one every deploy.
  if [ -f "$CADDY_DATA_ARCHIVE" ]; then
    say "restoring saved certificates"
    scp -q -i "$KEY_FILE" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        -o LogLevel=ERROR "$CADDY_DATA_ARCHIVE" "ubuntu@${IP}:/tmp/caddy-data.tar.gz"
  fi

  say "starting caddy (this obtains the certificate)"
  ssh_node "$IP" 'export KUBECONFIG=~/.kube/config
kubectl apply -f caddy.yaml
kubectl rollout status deployment/caddy --timeout=180s
if [ -f /tmp/caddy-data.tar.gz ]; then
  POD=$(kubectl get pod -l app=caddy -o jsonpath="{.items[0].metadata.name}")
  kubectl exec "$POD" -- tar xzf - -C /data < /tmp/caddy-data.tar.gz 2>/dev/null     && kubectl rollout restart deployment/caddy >/dev/null     && kubectl rollout status deployment/caddy --timeout=120s
fi'
  say "waiting for the certificate"
  for i in $(seq 1 30); do
    curl -fsS "https://${DUCKDNS_SUBDOMAIN}.duckdns.org/health" >/dev/null 2>&1 && break
    [ "$i" = 30 ] && warn "no certificate yet — kubectl logs deployment/caddy on the instance will say why"
    sleep 5
  done
fi

URL=$(public_host "$IP")
say "checking $URL/health"
for i in $(seq 1 20); do
  curl -fsS "$URL/health" >/dev/null 2>&1 && break
  [ "$i" = 20 ] && warn "health check never passed — try: ssh -i $KEY_FILE ubuntu@$IP 'kubectl get pods'"
  sleep 3
done

echo
ok "up: $URL"
echo "   ssh   ssh -i $KEY_FILE ubuntu@$IP"
echo "   pods  ssh -i $KEY_FILE ubuntu@$IP 'kubectl get pods'"
if ! use_https; then
  echo
  echo "   No DUCKDNS_SUBDOMAIN set, so this is a bare IP over plain HTTP and"
  echo "   the address changes on every deploy. OAuth sign-in needs a stable"
  echo "   callback URL — see deploy/deploy.env.example to turn it on."
fi
echo
warn "this instance bills by the hour — run deploy/down.sh when you are finished"

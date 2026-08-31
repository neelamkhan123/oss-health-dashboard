#!/usr/bin/env bash
# Destroy everything the deployment created. This is the half that keeps the
# project free, so it deliberately errs toward removing things.
#
# The EBS volume goes with the instance, so synced GitHub data does not
# survive. That is fine: up.sh rebuilds the schema and the first sync
# repopulates it in a couple of minutes.
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/config.sh

ID=$(instance_id)
if [ "$ID" = "None" ] || [ -z "$ID" ]; then
  ok "no running instance"
else
  say "terminating $ID"
  aws ec2 terminate-instances --instance-ids "$ID" >/dev/null
  aws ec2 wait instance-terminated --instance-ids "$ID"
  ok "instance terminated (its EBS volume went with it)"
fi

if [ "${KEEP_SG:-0}" != "1" ]; then
  SG=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=$SG_NAME" \
        --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo "None")
  if [ "$SG" != "None" ] && [ -n "$SG" ]; then
    # The group cannot be deleted until the terminated instance fully
    # releases its network interface, which takes a moment.
    for i in $(seq 1 12); do
      aws ec2 delete-security-group --group-id "$SG" >/dev/null 2>&1 && { ok "security group deleted"; break; }
      [ "$i" = 12 ] && warn "security group $SG still in use — delete it manually later"
      sleep 5
    done
  fi
fi

echo
ok "down — nothing is billing"
echo "   the key pair ($KEY_NAME) is kept so the next up.sh reuses it."
echo "   remove it with: aws ec2 delete-key-pair --key-name $KEY_NAME"

#!/bin/sh
# nginx resolves proxy_pass hostnames once, at config load, and refuses to
# start if the name is missing — so a web pod that comes up before the api
# Service exists would crash-loop instead of waiting. Pairing a runtime
# resolver with a variable upstream (see default.conf) defers the lookup to
# request time, which also means the API can come and go without taking the
# frontend down with it.
#
# The nameserver is whatever Kubernetes injected into the pod, so this works
# unchanged on k3s, any other cluster, and plain Docker.
set -e
NS=$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf)
if [ -n "$NS" ]; then
  echo "resolver ${NS} valid=10s ipv6=off;" > /etc/nginx/conf.d/resolver.conf
else
  : > /etc/nginx/conf.d/resolver.conf
fi

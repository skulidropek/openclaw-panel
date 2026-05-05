#!/bin/sh
set -eu

mkdir -p /home/node/.openclaw/agents/main /home/node/.openclaw/workspace /home/node/.config/systemd/user /run/user/1000
chown -R node:node /home/node/.openclaw /home/node/.config /run/user/1000
chmod 700 /run/user/1000

shutdown() {
  exit 0
}

trap shutdown INT TERM

while :; do
  sleep 2147483647 &
  wait "$!" || true
done

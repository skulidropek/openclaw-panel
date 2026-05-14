import { normalizeBotName } from "./bot.js"
import type { BotBundleInstallSpec } from "./bundle.js"
import { shellQuote } from "./provisioning.js"

const dollar = "$"

const runnerDockerfile = String.raw`FROM ghcr.io/openclaw/openclaw:latest
USER root
LABEL openclaw.panel.runner-version="2"
RUN apt-get update \
  && apt-get install -y --no-install-recommends dbus libpam-systemd systemd systemd-sysv sudo \
  && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /home/node/.openclaw/agents/main /home/node/.config/systemd/user /run/user/1000 \
  && chown -R node:node /home/node/.openclaw /home/node/.config /run/user/1000 \
  && chmod 700 /run/user/1000 \
  && install -d -m 0755 /var/lib/systemd/linger \
  && touch /var/lib/systemd/linger/node
COPY openclaw-panel-init.sh /usr/local/bin/openclaw-panel-init
COPY openclaw-panel-systemctl.sh /usr/local/bin/systemctl
RUN chmod +x /usr/local/bin/openclaw-panel-init /usr/local/bin/systemctl
STOPSIGNAL SIGTERM
CMD ["openclaw-panel-init"]
`

const runnerInitScript = String.raw`#!/bin/sh
set -eu
mkdir -p /home/node/.openclaw/agents/main /home/node/.openclaw/workspace /home/node/.config/systemd/user /run/user/1000
chown -R node:node /home/node/.openclaw /home/node/.config /run/user/1000
chmod 700 /run/user/1000
shutdown() { exit 0; }
trap shutdown INT TERM
while :; do
  sleep 2147483647 &
  wait "$!" || true
done
`

const runnerSystemctlScript = String.raw`#!/bin/sh
set -eu
while [ "$#" -gt 0 ]; do
  case "$1" in
    --user|--no-pager|--no-legend) shift ;;
    *) break ;;
  esac
done
command_name="${dollar}{1:-status}"
[ "$#" -gt 0 ] && shift
unit_name="${dollar}{1:-openclaw-gateway.service}"
case "$unit_name" in *.service) ;; *) unit_name="$unit_name.service" ;; esac
home_dir="${dollar}{HOME:-/home/node}"
unit_dir="$home_dir/.config/systemd/user"
unit_file="$unit_dir/$unit_name"
runtime_dir="${dollar}{XDG_RUNTIME_DIR:-/tmp}/openclaw-panel-systemctl"
pid_file="$runtime_dir/$unit_name.pid"
mkdir -p "$runtime_dir" "$home_dir/.openclaw"
load_unit_context() {
  [ -f "$unit_file" ] || return 0
  while IFS= read -r line; do
    case "$line" in
      Environment=*) eval "export ${dollar}{line#Environment=}" ;;
      WorkingDirectory=*)
        directory="${dollar}{line#WorkingDirectory=}"
        eval "cd $directory" 2>/dev/null || cd "$directory" 2>/dev/null || true
        ;;
    esac
  done < "$unit_file"
}
exec_start() { sed -n "s/^ExecStart=//p" "$unit_file" | head -1; }
stop_unit() {
  if [ -f "$pid_file" ]; then
    kill "$(cat "$pid_file")" 2>/dev/null || true
    rm -f "$pid_file"
  fi
}
start_unit() {
  [ -f "$unit_file" ] || exit 0
  if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then exit 0; fi
  load_unit_context
  command_line="$(exec_start)"
  [ -n "$command_line" ] || exit 0
  nohup sh -lc "exec $command_line" >> "$home_dir/.openclaw/gateway.log" 2>&1 &
  echo "$!" > "$pid_file"
}
case "$command_name" in
  status|list-units|daemon-reload|enable|is-enabled|show) exit 0 ;;
  start) start_unit; exit 0 ;;
  restart) stop_unit; start_unit; exit 0 ;;
  stop|disable) stop_unit; exit 0 ;;
  *) exit 0 ;;
esac
`

const ensureOpenClawConfigScript = String.raw`const crypto = require('node:crypto');
const fs = require('node:fs');
const file = '/home/node/.openclaw/openclaw.json';
const workspace = '/home/node/.openclaw/workspace';
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const record = (owner, key) => {
  const current = isRecord(owner[key]) ? owner[key] : {};
  owner[key] = current;
  return current;
};
fs.mkdirSync(workspace, { recursive: true });
const config = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const gateway = record(config, 'gateway');
const controlUi = record(gateway, 'controlUi');
const auth = record(gateway, 'auth');
gateway.port = 18789;
gateway.mode = 'local';
gateway.bind = 'lan';
controlUi.allowInsecureAuth = true;
controlUi.dangerouslyDisableDeviceAuth = true;
controlUi.allowedOrigins = ['http://localhost:18789', 'http://127.0.0.1:18789'];
auth.mode = 'token';
if (typeof auth.token !== 'string' || auth.token.length === 0) {
  auth.token = process.env.OPENCLAW_PANEL_GATEWAY_TOKEN || crypto.randomBytes(24).toString('hex');
}
fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n', 'utf8');
process.stdout.write(auth.token);
`

const installerHelpers = String.raw`random_hex() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 24; else od -An -N24 -tx1 /dev/urandom | tr -d ' \n'; fi
}
resolve_docker() {
  if docker info >/dev/null 2>&1; then DOCKER=(docker); return; fi
  if sudo -n docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker); return; fi
  echo "Docker is not reachable by docker or sudo -n docker." >&2
  exit 1
}
port_in_use() {
  local candidate="$1"
  if command -v ss >/dev/null 2>&1 && ss -ltn | awk '{print $4}' | grep -Eq "[:.]${dollar}{candidate}$"; then return 0; fi
  "${dollar}{DOCKER[@]}" ps --format '{{.Ports}}' | grep -Eq "[:.]${dollar}{candidate}->" 2>/dev/null
}
write_runner_build_context() {
  mkdir -p "$runner_dir"
  cat > "$runner_dir/Dockerfile" <<'OPENCLAW_RUNNER_DOCKERFILE'
${runnerDockerfile}
OPENCLAW_RUNNER_DOCKERFILE
  cat > "$runner_dir/openclaw-panel-init.sh" <<'OPENCLAW_RUNNER_INIT'
${runnerInitScript}
OPENCLAW_RUNNER_INIT
  cat > "$runner_dir/openclaw-panel-systemctl.sh" <<'OPENCLAW_RUNNER_SYSTEMCTL'
${runnerSystemctlScript}
OPENCLAW_RUNNER_SYSTEMCTL
}
ensure_runner_image() {
  if "${dollar}{DOCKER[@]}" image inspect "$runner_image" >/dev/null 2>&1; then return; fi
  write_runner_build_context
  "${dollar}{DOCKER[@]}" build -t "$runner_image" -f "$runner_dir/Dockerfile" "$runner_dir"
}
`

const installBody = String.raw`resolve_docker
if [ -z "${dollar}{OPENCLAW_GATEWAY_PORT:-}" ]; then
  while port_in_use "$gateway_port"; do gateway_port=$((gateway_port + 1)); done
fi
tmp_dir="$(mktemp -d)"
runner_dir="$tmp_dir/runner"
bundle_dir="$tmp_dir/bundle"
cleanup() { rm -rf "$tmp_dir"; }
trap cleanup EXIT
ensure_runner_image
curl -fsSL "$bundle_url" -o "$tmp_dir/bundle.tar.gz"
mkdir -p "$bundle_dir"
tar -xzf "$tmp_dir/bundle.tar.gz" -C "$bundle_dir"
if [ ! -d "$bundle_dir/openclaw" ]; then
  echo "Bundle is missing openclaw state." >&2
  exit 1
fi
"${dollar}{DOCKER[@]}" volume create "$volume_name" >/dev/null
"${dollar}{DOCKER[@]}" run --rm -u root \
  -v "$volume_name:/target" \
  -v "$bundle_dir/openclaw:/source:ro" \
  "$runner_image" \
  sh -lc 'mkdir -p /target && cd /source && tar -cf - . | tar -xf - -C /target && chown -R 1000:1000 /target'
"${dollar}{DOCKER[@]}" create \
  --name "$container_name" \
  --label "openclaw.panel.managed=true" \
  --label "openclaw.panel.bot-id=$bot_id" \
  --label "openclaw.panel.name=$bot_name" \
  --label "openclaw.panel.bundle-mode=$bundle_mode" \
  --privileged --restart unless-stopped --stop-signal SIGTERM \
  --tmpfs /run:rw,noexec,nosuid,size=65536k \
  --tmpfs /run/lock:rw,noexec,nosuid,size=65536k \
  --tmpfs /tmp:rw,nosuid,nodev \
  -e HOME=/home/node -e TERM=xterm-256color -e XDG_RUNTIME_DIR=/run/user/1000 \
  -e DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
  -e "OPENCLAW_PANEL_BOT_ID=$bot_id" \
  -v "$volume_name:/home/node/.openclaw" \
  -p "127.0.0.1:${dollar}{gateway_port}:18789" \
  "$runner_image" openclaw-panel-init >/dev/null
"${dollar}{DOCKER[@]}" start "$container_name" >/dev/null
for attempt in $(seq 1 60); do
  "${dollar}{DOCKER[@]}" exec -u root "$container_name" sh -lc true >/dev/null 2>&1 && break
  if [ "$attempt" = "60" ]; then echo "Container did not become ready." >&2; exit 1; fi
  sleep 1
done
`

const configureOpenClaw = String.raw`cat > "$tmp_dir/ensure-openclaw-config.js" <<'OPENCLAW_CONFIG_JS'
${ensureOpenClawConfigScript}
OPENCLAW_CONFIG_JS
"${dollar}{DOCKER[@]}" cp "$tmp_dir/ensure-openclaw-config.js" "$container_name:/tmp/ensure-openclaw-config.js"
effective_gateway_token="$("${dollar}{DOCKER[@]}" exec \
  -u node \
  -e HOME=/home/node \
  -e TERM=xterm-256color \
  -e XDG_RUNTIME_DIR=/run/user/1000 \
  -e DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
  -e "OPENCLAW_PANEL_GATEWAY_TOKEN=$gateway_token" \
  "$container_name" \
  node /tmp/ensure-openclaw-config.js)"
"${dollar}{DOCKER[@]}" exec \
  -u node \
  -e HOME=/home/node \
  -e TERM=xterm-256color \
  -e XDG_RUNTIME_DIR=/run/user/1000 \
  -e DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus \
  "$container_name" \
  sh -lc 'openclaw daemon install && openclaw daemon restart'
echo "OpenClaw bot installed."
echo "Container: $container_name"
echo "Gateway: http://127.0.0.1:${dollar}{gateway_port}"
echo "Gateway token: $effective_gateway_token"
`

const installHeader = (spec: BotBundleInstallSpec, defaultName: string): string =>
  String.raw`#!/usr/bin/env bash
set -euo pipefail
bundle_url=${shellQuote(spec.bundleUrl)}
default_bot_name=${shellQuote(defaultName)}
default_gateway_port=${shellQuote(String(spec.defaultGatewayPort))}
default_runner_image=${shellQuote(spec.defaultRunnerImage)}
bundle_mode=${shellQuote(spec.manifest.mode)}
`

const runtimeVariables = String.raw`
bot_id="${dollar}{OPENCLAW_BOT_ID:-$(random_hex | cut -c1-12)}"
bot_name="${dollar}{OPENCLAW_BOT_NAME:-$default_bot_name}"
gateway_port="${dollar}{OPENCLAW_GATEWAY_PORT:-$default_gateway_port}"
runner_image="${dollar}{OPENCLAW_RUNNER_IMAGE:-$default_runner_image}"
container_name="openclaw-panel-${dollar}{bot_id}"
volume_name="openclaw-panel-${dollar}{bot_id}-home"
gateway_token="${dollar}{OPENCLAW_GATEWAY_TOKEN:-$(random_hex)}"
`

export const generateBotBundleInstallScript = (spec: BotBundleInstallSpec): string =>
  [
    installHeader(spec, normalizeBotName(`${spec.defaultBotName}-copy`)),
    installerHelpers,
    runtimeVariables,
    installBody,
    configureOpenClaw
  ].join("\n")

# OpenClaw Panel MVP

This package runs a local one-click OpenClaw hosting panel.

## Run

```bash
corepack pnpm --filter @effect-template/app start
```

Defaults:

- Panel: `http://127.0.0.1:8080`
- Docker socket: `/var/run/docker.sock`
- Bot gateway ports: starting at `18789`
- Runner image: `openclaw-panel/openclaw-bot-runner:latest`

## Environment

- `OPENCLAW_PANEL_HOST`
- `OPENCLAW_PANEL_PORT`
- `OPENCLAW_PANEL_DOCKER_SOCKET`
- `OPENCLAW_PANEL_GATEWAY_PORT_START`
- `OPENCLAW_PANEL_RUNNER_IMAGE`

## Docker Model

Each bot is an isolated Docker container. The panel builds `docker/openclaw-bot-runner.Dockerfile`, creates a named
volume for `/home/node/.openclaw`, starts a tiny container init process, and attaches the browser terminal to:

```bash
openclaw onboard --install-daemon
```

The runner includes a container-local `systemctl` shim so `openclaw onboard --install-daemon` still creates and restarts
the OpenClaw gateway service, without depending on host systemd as container PID 1. Keep the panel bound to localhost
until authentication and multi-user isolation are added.

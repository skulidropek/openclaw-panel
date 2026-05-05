FROM ghcr.io/openclaw/openclaw:latest

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

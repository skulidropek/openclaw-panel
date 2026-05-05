FROM ghcr.io/openclaw/openclaw:latest

USER root

RUN apt-get update \
  && apt-get install -y --no-install-recommends dbus libpam-systemd systemd systemd-sysv sudo \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /home/node/.openclaw/agents/main /home/node/.config/systemd/user /run/user/1000 \
  && chown -R node:node /home/node/.openclaw /home/node/.config /run/user/1000 \
  && chmod 700 /run/user/1000 \
  && install -d -m 0755 /var/lib/systemd/linger \
  && touch /var/lib/systemd/linger/node

STOPSIGNAL SIGRTMIN+3

CMD ["/lib/systemd/systemd"]

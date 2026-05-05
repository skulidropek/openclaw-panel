#!/bin/sh
set -eu

while [ "$#" -gt 0 ]; do
  case "$1" in
    --user|--no-pager|--no-legend)
      shift
      ;;
    *)
      break
      ;;
  esac
done

command_name="${1:-status}"
if [ "$#" -gt 0 ]; then
  shift
fi

unit_name="${1:-openclaw-gateway.service}"
case "$unit_name" in
  *.service) ;;
  *) unit_name="$unit_name.service" ;;
esac

home_dir="${HOME:-/home/node}"
unit_dir="$home_dir/.config/systemd/user"
unit_file="$unit_dir/$unit_name"
runtime_dir="${XDG_RUNTIME_DIR:-/tmp}/openclaw-panel-systemctl"
pid_file="$runtime_dir/$unit_name.pid"

mkdir -p "$runtime_dir" "$home_dir/.openclaw"

load_unit_context() {
  [ -f "$unit_file" ] || return 0
  while IFS= read -r line; do
    case "$line" in
      Environment=*)
        eval "export ${line#Environment=}"
        ;;
      WorkingDirectory=*)
        directory="${line#WorkingDirectory=}"
        eval "cd $directory" 2>/dev/null || cd "$directory" 2>/dev/null || true
        ;;
    esac
  done < "$unit_file"
}

exec_start() {
  sed -n "s/^ExecStart=//p" "$unit_file" | head -1
}

stop_unit() {
  if [ -f "$pid_file" ]; then
    kill "$(cat "$pid_file")" 2>/dev/null || true
    rm -f "$pid_file"
  fi
}

start_unit() {
  [ -f "$unit_file" ] || exit 0
  if [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    exit 0
  fi
  load_unit_context
  command_line="$(exec_start)"
  [ -n "$command_line" ] || exit 0
  nohup sh -lc "exec $command_line" >> "$home_dir/.openclaw/gateway.log" 2>&1 &
  echo "$!" > "$pid_file"
}

case "$command_name" in
  status|list-units|daemon-reload|enable|is-enabled|show)
    exit 0
    ;;
  start)
    start_unit
    exit 0
    ;;
  restart)
    stop_unit
    start_unit
    exit 0
    ;;
  stop|disable)
    stop_unit
    exit 0
    ;;
  *)
    exit 0
    ;;
esac

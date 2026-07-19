#!/usr/bin/env bash
# Fault-Cam 01 launch — parameterized, repeatable per-run bring-up.
# provision.sh does one-time OS setup; launch.sh brings the pipeline UP for a run.
# Run as root (like provision.sh):
#   sudo bash /opt/beadz-camera/camera/launch.sh --mode loopback --profile
#   sudo bash /opt/beadz-camera/camera/launch.sh --mode lan \
#            --ingest-url http://192.168.1.20:8080/api/ingest
#   sudo bash /opt/beadz-camera/camera/launch.sh --stop
set -euo pipefail

REPO=/opt/beadz-camera
VENV="$REPO/venv"
CAMERA="$REPO/camera"
ENV_FILE=/etc/beadz-camera/device.env
SINK_ENV=/etc/beadz-camera/sink.env
UNIT_DIR=/etc/systemd/system

# ---- helpers ---------------------------------------------------------------
set_env_key() {  # KEY VALUE FILE — replace-in-place-or-append, idempotent, value-literal
    local key="$1" val="$2" file="$3" line found=0 tmp
    tmp="$(mktemp)"
    while IFS= read -r line || [ -n "$line" ]; do
        if [ "$found" -eq 0 ] && [[ "$line" == "${key}="* ]]; then
            printf '%s=%s\n' "$key" "$val" >> "$tmp"
            found=1
        else
            printf '%s\n' "$line" >> "$tmp"
        fi
    done < "$file"
    [ "$found" -eq 1 ] || printf '%s=%s\n' "$key" "$val" >> "$tmp"
    # truncate-and-write in place (NOT mv) so the file keeps its 0600 beadz ownership
    cat "$tmp" > "$file"
    rm -f "$tmp"
}

get_env_key() {  # KEY FILE -> value on stdout (empty if absent)
    grep "^$1=" "$2" 2>/dev/null | head -1 | cut -d= -f2- || true
}

require_root() {
    if [ "$(id -u)" -ne 0 ]; then
        echo "FAIL: run as root: sudo bash camera/launch.sh ..." >&2; exit 1
    fi
}

require_provisioned() {
    if [ ! -x "$VENV/bin/beadz-camera" ] || [ ! -f "$ENV_FILE" ]; then
        echo "FAIL: not provisioned — run 'sudo bash $CAMERA/provision.sh' first." >&2
        exit 1
    fi
}

install_timers() {
    cp "$CAMERA"/systemd/beadz-capture.service "$CAMERA"/systemd/beadz-capture.timer "$UNIT_DIR"/
    cp "$CAMERA"/systemd/beadz-push.service    "$CAMERA"/systemd/beadz-push.timer    "$UNIT_DIR"/
}

# ---- modes -----------------------------------------------------------------
do_loopback() {  # PORT SINK_DIR RESOLUTION PROFILE
    local port="$1" sink_dir="$2" resolution="$3" profile="$4"
    local state_dir key_path pubkey
    state_dir="$(get_env_key STATE_DIR "$ENV_FILE")"
    key_path="$(get_env_key ED25519_KEY_PATH "$ENV_FILE")"
    [ -n "$state_dir" ] || { echo "FAIL: STATE_DIR unset in $ENV_FILE" >&2; exit 1; }
    [ -n "$key_path" ]  || { echo "FAIL: ED25519_KEY_PATH unset in $ENV_FILE" >&2; exit 1; }
    pubkey="${key_path%.*}.pub"
    if [ ! -f "$pubkey" ]; then
        echo "FAIL: pubkey $pubkey missing — run keygen first:" >&2
        echo "  sudo -u beadz $VENV/bin/beadz-camera --env $ENV_FILE keygen" >&2
        exit 1
    fi

    set_env_key INGEST_URL "http://127.0.0.1:${port}/api/ingest" "$ENV_FILE"
    [ -n "$resolution" ] && set_env_key CAPTURE_RESOLUTION "$resolution" "$ENV_FILE"

    install -d -o beadz -g beadz -m 0755 "$sink_dir"
    cat > "$SINK_ENV" <<EOF
SINK_PORT=${port}
SINK_PUBKEY=${pubkey}
SINK_DIR=${sink_dir}
EOF
    chmod 0644 "$SINK_ENV"

    cp "$CAMERA"/systemd/beadz-sink.service "$UNIT_DIR"/
    install_timers
    systemctl daemon-reload
    systemctl enable --now beadz-sink.service beadz-capture.timer beadz-push.timer

    if [ "$profile" = "1" ]; then
        systemctl reset-failed beadz-profile.service 2>/dev/null || true
        systemd-run --unit=beadz-profile --collect \
            "$CAMERA/scripts/profile-snapshot.sh" \
            --out "$sink_dir/profile.csv" --sink-dir "$sink_dir" --state-dir "$state_dir"
    fi

    echo "== loopback up =="
    echo "  sink:    http://127.0.0.1:${port}/api/ingest  (frames -> ${sink_dir}/frames)"
    echo "  timers:  capture=$(systemctl is-active beadz-capture.timer) push=$(systemctl is-active beadz-push.timer)"
    [ "$profile" = "1" ] && echo "  profile: ${sink_dir}/profile.csv (unit beadz-profile)"
    echo "  watch:   journalctl -u beadz-capture -u beadz-push -u beadz-sink -f"
}

do_lan() {  # INGEST_URL RESOLUTION
    local ingest_url="$1" resolution="$2"
    [ -n "$ingest_url" ] || { echo "FAIL: --ingest-url required for lan mode" >&2; exit 1; }
    set_env_key INGEST_URL "$ingest_url" "$ENV_FILE"
    [ -n "$resolution" ] && set_env_key CAPTURE_RESOLUTION "$resolution" "$ENV_FILE"
    install_timers
    systemctl daemon-reload
    systemctl enable --now beadz-capture.timer beadz-push.timer
    echo "== lan up =="
    echo "  pushing to: ${ingest_url}"
    echo "  (the remote sink must be reachable and share HMAC_SECRET + the pubkey)"
    echo "  watch: journalctl -u beadz-capture -u beadz-push -f"
}

do_stop() {
    systemctl disable --now beadz-sink.service beadz-capture.timer beadz-push.timer 2>/dev/null || true
    systemctl stop beadz-profile.service 2>/dev/null || true
    echo "== stopped: sink service, camera timers, profiler (device.env/state left as-is) =="
}

main() {
    require_root
    local mode="" port=8080 sink_dir=/var/lib/beadz-sink resolution="" profile=0 ingest_url="" stop=0
    while [ $# -gt 0 ]; do
        case "$1" in
            --mode)       mode="$2"; shift 2 ;;
            --port)       port="$2"; shift 2 ;;
            --sink-dir)   sink_dir="$2"; shift 2 ;;
            --resolution) resolution="$2"; shift 2 ;;
            --ingest-url) ingest_url="$2"; shift 2 ;;
            --profile)    profile=1; shift ;;
            --stop)       stop=1; shift ;;
            *) echo "unknown arg: $1" >&2; exit 2 ;;
        esac
    done

    if [ "$stop" = "1" ]; then do_stop; return; fi
    require_provisioned
    if [ "$profile" = "1" ] && [ "$mode" = "lan" ]; then
        echo "WARN: --profile is ignored in --mode lan (profiler only runs in loopback mode)" >&2
    fi
    case "$mode" in
        loopback) do_loopback "$port" "$sink_dir" "$resolution" "$profile" ;;
        lan)      do_lan "$ingest_url" "$resolution" ;;
        *) echo "FAIL: --mode loopback|lan required (or --stop)" >&2; exit 2 ;;
    esac
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then main "$@"; fi

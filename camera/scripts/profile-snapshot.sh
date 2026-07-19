#!/usr/bin/env bash
# Fault-Cam profiling collector — CSV time-series of the loopback self-test.
# Samples the sink's memory/CPU, on-disk sizes, frame count, and journald error
# deltas. Started by `launch.sh --profile` (via systemd-run) or run by hand.
# Reads only sizes/PID stats — no frame contents, no secrets.
set -euo pipefail

INTERVAL=300
OUT=/var/lib/beadz-sink/profile.csv
SINK_DIR=/var/lib/beadz-sink
STATE_DIR=/var/lib/beadz-camera
DURATION=0   # 0 = run until stopped

while [ $# -gt 0 ]; do
    case "$1" in
        --interval)  INTERVAL="$2"; shift 2 ;;
        --out)       OUT="$2"; shift 2 ;;
        --sink-dir)  SINK_DIR="$2"; shift 2 ;;
        --state-dir) STATE_DIR="$2"; shift 2 ;;
        --duration)  DURATION="$2"; shift 2 ;;
        *) echo "unknown arg: $1" >&2; exit 2 ;;
    esac
done

dir_bytes() { if [ -d "$1" ]; then du -sb "$1" 2>/dev/null | cut -f1; else echo 0; fi; }

if [ ! -f "$OUT" ]; then
    echo "ts_iso,sink_rss_kb,sink_cpu_pct,queue_bytes,archive_bytes,sink_frames_bytes,sink_frame_count,err_count" > "$OUT"
fi

start_epoch=$(date +%s)
last_ts=$(date -Is)
while :; do
    ts=$(date -Is)
    pid=$(systemctl show -p MainPID --value beadz-sink.service 2>/dev/null || echo 0)
    if [ "${pid:-0}" -gt 0 ] 2>/dev/null; then
        read -r rss cpu < <(ps -o rss=,pcpu= -p "$pid" 2>/dev/null || echo "0 0")
    else
        rss=0; cpu=0
    fi
    q=$(dir_bytes "$STATE_DIR/queue")
    a=$(dir_bytes "$STATE_DIR/archive")
    f=$(dir_bytes "$SINK_DIR/frames")
    fc=$(find "$SINK_DIR/frames" -maxdepth 1 -name '*.jpg' 2>/dev/null | wc -l | tr -d ' ')
    ec=$(journalctl -u beadz-capture -u beadz-push -u beadz-sink -p err \
             --since "$last_ts" --no-pager 2>/dev/null | grep -c . || echo 0)
    last_ts="$ts"
    printf '%s,%s,%s,%s,%s,%s,%s,%s\n' \
        "$ts" "${rss:-0}" "${cpu:-0}" "$q" "$a" "$f" "$fc" "$ec" >> "$OUT"
    if [ "$DURATION" -gt 0 ] && [ $(( $(date +%s) - start_epoch )) -ge "$DURATION" ]; then
        break
    fi
    sleep "$INTERVAL"
done

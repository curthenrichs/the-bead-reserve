#!/usr/bin/env bash
# Fault-Cam 01 bring-up smoke test. Run ON THE PI, as a user that can sudo.
# Prereqs: fswebcam installed; python3; sha256sum; repo at /opt/beadz-camera;
#          venv built; tmpfs /tmp enabled (see README); /etc/beadz-camera/device.env
#          filled in; beadz user exists.
set -euo pipefail

ENV=/etc/beadz-camera/device.env
BIN=/opt/beadz-camera/venv/bin/beadz-camera

echo "== 0. /tmp must be tmpfs (raw frames stay off the SD card) =="
if [ "$(findmnt -n -o FSTYPE /tmp)" != "tmpfs" ]; then
    echo "   FAIL: /tmp is not tmpfs. Enable it:"
    echo "   sudo cp /usr/share/systemd/tmp.mount /etc/systemd/system/ && sudo systemctl enable --now tmp.mount"
    exit 1
fi

echo "== 1. keygen (skip if key exists) =="
sudo -u beadz "$BIN" --env "$ENV" keygen || echo "(key already present)"

echo "== 2. seed counter (skip if seeded) =="
sudo -u beadz "$BIN" --env "$ENV" seed-counter || echo "(already seeded)"

echo "== 3. real capture =="
sudo -u beadz "$BIN" --env "$ENV" capture-once
echo "   -> eyeball the newest queue/*.jpg: crop must show ONLY the jar box."

echo "== 4. real push =="
sudo -u beadz "$BIN" --env "$ENV" push-drain

echo "== 5. independent verification (the check a stranger would run) =="
STATE_DIR=$(sudo -u beadz grep '^STATE_DIR=' "$ENV" | cut -d= -f2)
NEWEST_JSON=$(ls -1 "$STATE_DIR"/archive/*.json | sort -V | tail -1)
HASH=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['sha256'])" "$NEWEST_JSON")
JPG="${NEWEST_JSON%.json}.jpg"
echo "   metadata sha256 : $HASH"
echo "   recomputed      : $(sha256sum "$JPG" | cut -d' ' -f1)"
echo "   (these two lines MUST match; verify the Ed25519 sig against the"
echo "    published pubkey via the site's verification instructions)"

echo "== 6. install timers =="
sudo cp /opt/beadz-camera/camera/systemd/beadz-*.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now beadz-capture.timer beadz-push.timer
systemctl list-timers 'beadz-*'

echo "== smoke complete. Now: reboot, confirm timers survive; yank ethernet"
echo "   for an hour, confirm the queue backfills when it returns. =="

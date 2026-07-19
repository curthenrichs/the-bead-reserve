#!/usr/bin/env bash
# Fault-Cam 01 one-command provisioning. Run ON THE PI, from anywhere:
#   sudo bash /opt/beadz-camera/camera/provision.sh
# Idempotent: safe to rerun after a partial failure or on an already-
# provisioned device. This file is the complete apt-level dependency
# manifest for the device.

set -euo pipefail

REPO=/opt/beadz-camera
VENV="$REPO/venv"
ENV_DIR=/etc/beadz-camera
ENV_FILE="$ENV_DIR/device.env"

echo "== 0. guards =="
if ! command -v apt-get >/dev/null 2>&1; then
    echo "FAIL: apt-get not found — this provisions a Raspberry Pi OS device," >&2
    echo "      not a dev workstation." >&2
    exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
    echo "FAIL: run as root: sudo bash camera/provision.sh" >&2
    exit 1
fi
if [ ! -f "$REPO/camera/pyproject.toml" ]; then
    echo "FAIL: repo not found at $REPO — clone it there first." >&2
    exit 1
fi

echo "== 1. apt packages =="
apt-get update
apt-get install -y git fswebcam python3 python3-venv

echo "== 2. beadz service user (video group) =="
if ! id beadz >/dev/null 2>&1; then
    useradd --system --shell /usr/sbin/nologin beadz
fi
usermod -aG video beadz

echo "== 3. tmpfs /tmp (raw frames must never touch the SD card) =="
if [ "$(findmnt -n -o FSTYPE /tmp)" != "tmpfs" ]; then
    cp /usr/share/systemd/tmp.mount /etc/systemd/system/
    systemctl enable --now tmp.mount
fi

echo "== 4. venv + pipeline install =="
if [ ! -x "$VENV/bin/pip" ]; then
    python3 -m venv "$VENV"
fi
"$VENV/bin/pip" install -e "$REPO/camera"

echo "== 5. device config =="
mkdir -p "$ENV_DIR"
if [ ! -f "$ENV_FILE" ]; then
    cp "$REPO/camera/device.env.example" "$ENV_FILE"
fi
chown beadz:beadz "$ENV_FILE"
chmod 0600 "$ENV_FILE"

echo "== provision complete. Next: =="
echo "   1. edit $ENV_FILE"
echo "   2. bash $REPO/camera/smoke.sh"

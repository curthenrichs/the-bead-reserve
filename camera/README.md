# Fault-Cam 01 — capture-and-sign pipeline

Subsystem C of the Bead Reserve: an hourly still of the reserve jar,
EXIF-stripped, tightly cropped, SHA-256-hashed, Ed25519-signed, queued on
disk, and pushed (with backfill) to the ingest backend. The signature is
over the hash of the exact bytes served publicly — anyone can download a
frame, re-hash it, and verify against the published public key.

## Layout

- `src/` — the pipeline (`pip install -e .` exposes the `beadz-camera` CLI)
- `systemd/` — one-shot units: `beadz-capture` (hourly), `beadz-push` (5 min)
- `tests/` — pytest suite; runs anywhere (`pip install -e .[dev] && pytest`)
- `device.env.example` — device config template (copy to `device.env`; never
  commit the real one)
- `.env.example` — dev-workstation SSH template for reaching the Pi
- `smoke.sh` — on-Pi bring-up checklist

## Pi bring-up (summary)

1. Pi OS Lite 64-bit; `sudo apt-get install -y git`, then clone this repo to
   `/opt/beadz-camera`.
2. `sudo bash camera/provision.sh` — idempotent one-command setup: apt
   packages (the script is the complete manifest), `beadz` service user
   (`video` group), tmpfs `/tmp`, venv build, and seeds
   `/etc/beadz-camera/device.env` (mode 0600; never overwrites an existing
   one). Refuses to run on a non-apt machine.
3. Fill in `/etc/beadz-camera/device.env`.
4. Run `bash camera/smoke.sh` — it keygens (prints the public key: publish
   it), seeds the counter, does one real capture+push, walks the
   independent hash verification, and installs the timers.

tmpfs note: the systemd units already get a private tmpfs-backed `/tmp`
from `PrivateTmp=yes`; the host `tmp.mount` (enabled by `provision.sh`)
matters for manual runs like `smoke.sh`. The capture unit enforces the
check per-run via `ExecCondition=findmnt -n -t tmpfs /tmp`; a failed
condition skips the capture and logs a journal line.

The device holds no chain key, listens on no ports, and pushes outbound
TLS only. Raw (uncropped) frames never touch the SD card.

## Exit codes

The CLI contract:

- `0` → success; no errors; frame queued and signed
- `1` → pipeline failure (recoverable); error recorded in `status.json`
- `2` → config error (fix `device.env` and retry)
- `3` → already initialized (benign rerun; e.g., keygen finds existing key)

## Counter recovery

If the counter file (`STATE_DIR/counter`) is corrupt or lost, restore it with:

```bash
sudo -u beadz beadz-camera --env /etc/beadz-camera/device.env seed-counter --force --value N
```

The backend rejects any counter value already seen (replay protection). `N` must
exceed the highest counter the backend has recorded so far.

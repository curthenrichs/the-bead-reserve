# Fault-Cam 01: capture-and-sign pipeline

Subsystem of the Bead Reserve: an hourly still of the reserve jar,
EXIF-stripped, tightly cropped, SHA-256-hashed, Ed25519-signed, queued on
disk, and pushed (with backfill) to the ingest backend. The signature is
over the hash of the exact bytes served publicly, so anyone can download a
frame, re-hash it, and verify against the published public key.

## Layout

- `src/`: the pipeline (`pip install -e .` exposes the `beadz-camera` CLI)
- `systemd/`: one-shot units, `beadz-capture` (hourly) and `beadz-push`
  (every 5 minutes)
- `tests/`: pytest suite; runs anywhere (`pip install -e .[dev] && pytest`)
- `device.env.example`: device config template. Copy it to `device.env` and
  never commit the real one.
- `scripts/`: bring-up smoke test + local ingest sink

## Pi bring-up (summary)

1. Pi OS Lite 64-bit; `sudo apt-get install -y git`, then clone this repo to
   `/opt/beadz-camera`.
2. `sudo bash camera/provision.sh` does the whole setup in one idempotent
   command: apt packages (the script is the complete manifest), the `beadz`
   service user in the `video` group, tmpfs `/tmp`, the venv build, creates
   the `beadz`-owned state dir, and a seeded `/etc/beadz-camera/device.env`
   (mode 0600; an existing file is never overwritten). It refuses to run on
   a non-apt machine.
3. Fill in `/etc/beadz-camera/device.env`.
4. Run `bash camera/scripts/smoke.sh`. It keygens (prints the public key: publish
   it), seeds the counter, does one real capture+push, walks the
   independent hash verification, and installs the timers.

   Smoke step 4 (the real push) needs a reachable `INGEST_URL`. Until the
   production backend exists, point it at a locally-running
   `scripts/ingest-sink.py` (see "Local integration sink" below) — otherwise
   step 4 reports a push failure. That's not fatal: the frame stays safely
   queued and drains on the next successful push.

tmpfs note: the systemd units already get a private tmpfs-backed `/tmp`
from `PrivateTmp=yes`; the host `tmp.mount` (enabled by `provision.sh`)
matters for manual runs like `smoke.sh`. The capture unit enforces the
check per-run via `ExecCondition=findmnt -n -t tmpfs /tmp`; a failed
condition skips the capture and logs a journal line.

The device holds no chain key and listens on no ports; its only network
traffic is the outbound TLS push. Raw (uncropped) frames never touch the
SD card.

## Local integration sink

`scripts/ingest-sink.py` is a contract-reference implementation of the
ingest backend: the real backend (not yet built) has to match its
behavior. Point a Pi's `INGEST_URL` at it to watch an actual push land,
frame and all, without standing up the real backend first. It reuses the
device's own HMAC and Ed25519 primitives, so it verifies pushes exactly
the way the eventual backend will.

```bash
python scripts/ingest-sink.py --port 8080 --bind 0.0.0.0 \
    --env /path/to/device.env --pubkey-file /path/to/ed25519.pub
```

Then set the Pi's `INGEST_URL` to `http://<this-machine's-LAN-IP>:8080/api/ingest`.

On Windows, the first run with `--bind 0.0.0.0` may trigger a Firewall
prompt — allow it on private networks.

Caution: the sink holds the shared HMAC secret and (by default) listens on
all interfaces — run it only on a trusted LAN.

## Exit codes

The CLI contract:

- `0` → success; no errors; frame queued and signed
- `1` → pipeline failure (recoverable); error recorded in `status.json`
- `2` → config error (fix `device.env` and retry)
- `3` → already initialized (benign rerun of `seed-counter` against an
  existing counter file; `keygen` is idempotent and returns `0` on rerun,
  reprinting the public key instead)

## Counter recovery

If the counter file (`STATE_DIR/counter`) is corrupt or lost, restore it with:

```bash
sudo -u beadz /opt/beadz-camera/venv/bin/beadz-camera --env /etc/beadz-camera/device.env seed-counter --force --value N
```

The backend rejects any counter value already seen (replay protection). `N` must
exceed the highest counter the backend has recorded so far.

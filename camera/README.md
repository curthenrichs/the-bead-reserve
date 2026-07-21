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

## Loopback self-test & profiling

Before anything touches the LAN, `launch.sh` (repo root: `camera/launch.sh`,
run as root like `provision.sh`) can bring the whole pipeline up against the
integration sink running locally on the Pi — capture, sign, push, and verify,
end to end, with nothing crossing the network boundary. This is the runbook
for that campaign.

1. Provision once: `sudo bash camera/provision.sh` (see above).
2. Generate the signing key:
   ```bash
   sudo -u beadz /opt/beadz-camera/venv/bin/beadz-camera \
       --env /etc/beadz-camera/device.env keygen
   ```
   Prints the public key and writes it next to `ED25519_KEY_PATH` (`.key` ->
   `.pub`). Rerunning is safe — it re-derives and reprints the same pubkey
   instead of failing.
3. Set `CAPTURE_RESOLUTION` (passed straight to `fswebcam -r WxH`) to a mode
   the webcam actually supports, and `CROP_RECT` to the jar box inside it.
   `CROP_RECT` must fit inside `CAPTURE_RESOLUTION` — the bounds check hard-fails
   the capture otherwise. If unsure of the real frame size, capture once by
   hand and measure it before committing to a crop.
4. Bring the loopback run up:
   ```bash
   sudo bash camera/launch.sh --mode loopback --profile
   ```
   This installs and starts `beadz-sink.service` (the local ingest sink) and
   configures the pipeline's `INGEST_URL` to point at it (`http://127.0.0.1:<port>/api/ingest`),
   alongside
   the usual `beadz-capture`/`beadz-push` timers, and — with `--profile` —
   launches a transient `beadz-profile` unit running
   `scripts/profile-snapshot.sh` in the background. Other flags:
   `--port` (default 8080), `--sink-dir` (default `/var/lib/beadz-sink`), and
   `--resolution` to set `CAPTURE_RESOLUTION` in the same step.
5. Watch it run:
   - `journalctl -u beadz-capture -u beadz-push -u beadz-sink -f`
   - the profiler's CSV at `<sink-dir>/profile.csv`, one row every 5 minutes
     by default, columns: `ts_iso, sink_rss_kb, sink_cpu_pct, queue_bytes,
     archive_bytes, sink_frames_bytes, sink_frame_count, err_count`. To confirm
     the `err_count` column is live, log a test error on the Pi with `logger -p
     err -t beadz-sink test` and verify the next sample increments `err_count`.
6. Monday's LAN leg: start the sink on the dev machine, bound to all
   interfaces so the Pi can reach it —
   ```bash
   python scripts/ingest-sink.py --port 8080 --bind 0.0.0.0 \
       --env /path/to/device.env --pubkey-file /path/to/ed25519.pub
   ```
   — then point the Pi at it:
   ```bash
   sudo bash camera/launch.sh --mode lan --ingest-url http://<dev-ip>:8080/api/ingest
   ```
   (`--resolution` works here too; `--profile` is ignored in `lan` mode — the
   profiler only runs against the local loopback sink.)
7. Tear down either mode: `sudo bash camera/launch.sh --stop`. Stops
   `beadz-sink.service`, the capture/push timers, and the profiler; leaves
   `device.env` and all on-disk state untouched.

Either way, the sink (`scripts/ingest-sink.py`, run as `beadz-sink.service`
in loopback mode) is a **self-test / contract oracle**, not production
ingest — production is the Cloudflare Worker (subsystem B), not yet built.
`beadz-sink.service` itself is installed only by `launch.sh`; `provision.sh`
and `smoke.sh` never touch it.

## Optional: the Chief Reserve Officer (CRO)

The CRO is a small vision-language model (SmolVLM-500M) that adds a deadpan,
in-character `croText` "audit" to each frame. It is **strictly optional and
advisory** — off by default, never part of the signed material, and it can
never break capture/sign/push. Enable it only if you want the flavor text.

1. `bash camera/provision-cro.sh` (run as the operator, not root). Builds
   `llama-server` from source (~40 min on a 3B+) and fetches the verified
   SmolVLM Q8 model. It prints the `CRO_*` paths to set.
2. Put those paths in `/etc/beadz-camera/device.env` and set `CRO_IMPL=smolvlm`.
   Ensure the `beadz` service user can read the binary + model files.
3. The next hourly capture spawns inference (~2.5–3 min, within the hourly
   budget) and writes `croText`. Watch `status.json`'s `last_cro` — a `false`
   there never fails the capture (it stays advisory). To turn it back off, set
   `CRO_IMPL=null`.

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

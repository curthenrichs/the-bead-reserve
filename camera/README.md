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

1. Pi OS Lite 64-bit, `beadz` service user (in `video` group), `fswebcam`.
2. Clone to `/opt/beadz-camera`; `python3 -m venv venv && venv/bin/pip
   install -e ./camera`.
3. Enable tmpfs `/tmp` (raw frames must not touch the SD card): `sudo cp
   /usr/share/systemd/tmp.mount /etc/systemd/system/ && sudo systemctl
   enable --now tmp.mount`. (The systemd path already gets a private
   tmpfs-backed /tmp from PrivateTmp=yes; the host tmp.mount matters for
   manual runs like smoke.sh.)
4. `sudo mkdir -p /etc/beadz-camera`, `sudo cp camera/device.env.example
   /etc/beadz-camera/device.env`, fill in, `sudo chown beadz:beadz
   /etc/beadz-camera/device.env`, `sudo chmod 0600
   /etc/beadz-camera/device.env`.
5. Run `bash camera/smoke.sh` — it keygens (prints the public key: publish
   it), seeds the counter, does one real capture+push, walks the
   independent hash verification, and installs the timers.

The device holds no chain key, listens on no ports, and pushes outbound
TLS only. Raw (uncropped) frames never touch the SD card.

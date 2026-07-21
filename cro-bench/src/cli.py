"""beadz-cro-bench CLI.

run: spawn llama-server (or target --server-url), sweep images x
variants (3 grammar-constrained slots + 1 flavor call each), render the
audit template, stream results.jsonl + transcript.md. A failed call is
recorded and the sweep continues. Exit codes: 0 all calls OK - 1 any
call failed - 2 setup failure (one actionable line, no traceback)."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from . import calls, fetch, flavor, server
from .results import RunWriter
from .variant import FLAVOR_ID, Variant, VariantError, load_variant, render

IMAGE_EXTS = {".jpg", ".jpeg", ".png"}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="beadz-cro-bench")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="sweep sample images x prompt variants")
    run.add_argument("--variant", action="append", required=True,
                     help="variant dir, or a name under variants/ (repeatable)")
    run.add_argument("--images", type=Path, default=Path("samples"))
    run.add_argument("--run-name", help="output dir name under out/ (default: timestamp)")
    run.add_argument("--port", type=int, default=8091)
    run.add_argument("--server-bin", default="llama-server")
    run.add_argument("--server-url",
                     help="use an already-running server (warm dev iteration); skips spawn/kill")
    run.add_argument("--model", type=Path,
                     default=Path("models/SmolVLM-500M-Instruct-Q8_0.gguf"))
    run.add_argument("--mmproj", type=Path,
                     default=Path("models/mmproj-SmolVLM-500M-Instruct-Q8_0.gguf"))
    run.add_argument("--timeout", type=float, default=600.0,
                     help="per-call timeout in seconds (Pi-scale default)")

    fetch_p = sub.add_parser("fetch-models", help="download + sha256-verify pinned GGUFs")
    fetch_p.add_argument("--quant", default="Q8_0", choices=sorted(fetch.MODELS))
    return parser


def _resolve_variant(arg: str) -> Path:
    p = Path(arg)
    if p.is_dir():
        return p
    named = Path("variants") / arg
    if named.is_dir():
        return named
    raise VariantError(f"variant not found: {arg!r} (no dir at {p} or {named})")


def _find_images(images_dir: Path) -> list[Path]:
    if not images_dir.is_dir():
        raise VariantError(f"images dir not found: {images_dir}")
    images = sorted(p for p in images_dir.iterdir()
                    if p.suffix.lower() in IMAGE_EXTS)
    if not images:
        raise VariantError(f"no images (*.jpg, *.png) in {images_dir}")
    return images


def _calls_for(v: Variant):
    # Slots use the neutral persona (honest jar/lid/level); the flavor call
    # uses flavor_persona (its own character, or the same persona if unset).
    for slot in v.slots:
        yield slot.id, slot.prompt, slot.grammar, v.slot_sampling, v.persona
    yield FLAVOR_ID, v.flavor_prompt, None, v.flavor_sampling, v.flavor_persona


def _best_of_flavor(base_url, v, prompt, image_b64, persona, timeout, mime):
    """Up to v.flavor_best_of flavor attempts; return (chosen, total_wall_ms,
    last_exc). Stops at the first candidate clearing flavor.is_junk; if none
    clear it, returns the first candidate (the hourly stream tolerates an
    occasional dull line — production suppresses, the bench still shows it).
    chosen is None only when every attempt errored."""
    candidates: list[str] = []
    total_wall = 0
    last_exc = None
    for _ in range(v.flavor_best_of):
        try:
            text, wall_ms = calls.audit_call(
                base_url, persona, prompt, image_b64, v.flavor_sampling,
                grammar=None, timeout=timeout, mime=mime)
        except calls.CallError as exc:
            last_exc = exc
            continue
        total_wall += wall_ms
        candidates.append(text)
        if not flavor.is_junk(text, persona):
            return text, total_wall, None
    if candidates:
        return candidates[0], total_wall, None
    return None, total_wall, last_exc


def _cmd_run(args: argparse.Namespace) -> int:
    variants = [load_variant(_resolve_variant(a)) for a in args.variant]
    images = _find_images(args.images)
    run_name = args.run_name or time.strftime("%Y%m%d-%H%M%S")
    out_dir = Path("out") / run_name
    out_dir.mkdir(parents=True, exist_ok=True)

    proc = None
    writer = None
    ok = failed = 0
    try:
        if args.server_url:
            base_url, model_load_s = args.server_url.rstrip("/"), None
            server.wait_healthy(base_url, timeout=10)
        else:
            proc, base_url, model_load_s = server.start_server(
                args.server_bin, args.model, args.mmproj, args.port,
                log_path=out_dir / "llama-server.log")

        writer = RunWriter(out_dir)
        writer.run_start(
            variants=[v.name for v in variants],
            images=[p.name for p in images],
            model=str(args.model), mmproj=str(args.mmproj),
            model_load_s=model_load_s, platform=sys.platform,
            server_url=args.server_url, timeout_s=args.timeout)
        for image in images:
            try:
                image_b64 = calls.encode_image(image)
            except OSError as exc:
                failed += 1
                err = f"cannot read image: {exc}"
                writer.call(variants[0].name, image.name, "image", "",
                            error=err)
                writer.audit(variants[0].name, image.name, {}, {},
                             None, error=err)
                continue
            mime = "image/png" if image.suffix.lower() == ".png" else "image/jpeg"
            for v in variants:
                answers: dict[str, str] = {}
                timings: dict[str, int] = {}
                error = None
                for cid, prompt, grammar, sampling, persona in _calls_for(v):
                    if cid == FLAVOR_ID and v.flavor_best_of > 1:
                        text, wall_ms, exc = _best_of_flavor(
                            base_url, v, prompt, image_b64, persona,
                            args.timeout, mime)
                        if text is None:
                            failed += 1
                            error = f"{cid}: {exc}" if error is None else error
                            writer.call(v.name, image.name, cid, prompt,
                                        error=str(exc))
                            continue
                        ok += 1
                        answers[cid] = text
                        timings[cid] = wall_ms
                        writer.call(v.name, image.name, cid, prompt,
                                    response=text, wall_ms=wall_ms)
                        continue
                    try:
                        text, wall_ms = calls.audit_call(
                            base_url, persona, prompt, image_b64, sampling,
                            grammar=grammar, timeout=args.timeout, mime=mime)
                    except calls.CallError as exc:
                        failed += 1
                        error = f"{cid}: {exc}" if error is None else error
                        writer.call(v.name, image.name, cid, prompt,
                                    error=str(exc))
                        continue
                    ok += 1
                    answers[cid] = text
                    timings[cid] = wall_ms
                    writer.call(v.name, image.name, cid, prompt,
                                response=text, wall_ms=wall_ms)
                audit_text = render(v, answers) if error is None else None
                writer.audit(v.name, image.name, answers, timings,
                             audit_text, error=error)
    finally:
        peak = server.peak_rss_kb(proc.pid) if proc else None
        if proc:
            server.stop_server(proc)
        if writer is not None:
            writer.run_end(ok, failed, peak)
    print(f"run written to {out_dir} ({ok} calls ok, {failed} failed)")
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "run":
            return _cmd_run(args)
        return fetch.cmd_fetch(args.quant)
    except (VariantError, server.ServerError, fetch.FetchError, OSError) as exc:
        print(f"setup error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

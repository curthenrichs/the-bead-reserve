"""beadz-cro-bench CLI.

Exit codes: 0 all calls OK - 1 any call failed - 2 setup failure
(invalid variant, missing model files, server never healthy). Setup
failures print one actionable line, never a traceback."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


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
    fetch_p.add_argument("--quant", default="Q8_0")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    print(f"{args.command}: not implemented yet", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())

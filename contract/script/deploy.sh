#!/usr/bin/env bash
# Deploys Beadz via script/Deploy.s.sol, signed by the deployer keystore.
#
# Usage:
#   deploy.sh              dry run: full simulation against BEADZ_RPC_URL, no tx
#   deploy.sh --broadcast  real deploy; adds Etherscan verification when
#                          ETHERSCAN_API_KEY is set and chain is not local Anvil;
#                          records the address as BEADZ_ADDRESS in contract/.env
set -uo pipefail
. "$(dirname "$0")/common.sh"
require_env BEADZ_ACCOUNT_PREFIX BEADZ_KEEPER BEADZ_TREASURY BEADZ_AIRDROP_BEADS
require_rpc
cd "$CONTRACT_DIR"

case "${1:-}" in
    ""|--broadcast) ;;
    *) die "usage: deploy.sh [--broadcast]" ;;
esac

broadcast=0
args=(script/Deploy.s.sol:DeployBeadz --rpc-url "$BEADZ_RPC_URL"
      --account "$(acct deployer)" "${PW_OPTS[@]}")
if [ "${1:-}" = "--broadcast" ]; then
    broadcast=1
    args+=(--broadcast)
    if [ -n "${ETHERSCAN_API_KEY:-}" ] && [ "$CHAIN_ID" != "31337" ]; then
        args+=(--verify --etherscan-api-key "$ETHERSCAN_API_KEY")
    fi
else
    echo "== DRY RUN: simulation only (rerun with --broadcast to deploy for real)"
fi

LOG="broadcast/Deploy.s.sol/$CHAIN_ID/run-latest.json"
before=$( [ -f "$LOG" ] && cksum "$LOG" 2>/dev/null )

forge script "${args[@]}"
FORGE_EXIT=$?

if [ "$broadcast" -eq 1 ]; then
    after=$( [ -f "$LOG" ] && cksum "$LOG" 2>/dev/null )
    if [ -f "$LOG" ] && [ "$before" != "$after" ]; then
        addr=$(sed -n 's/.*"contractAddress": *"\(0x[0-9a-fA-F]\{40\}\)".*/\1/p' \
            "$LOG" | head -1)
        [ -n "$addr" ] || die "could not read deployed address from broadcast log"
        if grep -q '^BEADZ_ADDRESS=' .env 2>/dev/null; then
            sed -i.bak "s/^BEADZ_ADDRESS=.*/BEADZ_ADDRESS=$addr/" .env || die "failed to update BEADZ_ADDRESS in .env"
            rm -f .env.bak
        else
            echo "BEADZ_ADDRESS=$addr" >> .env || die "failed to append BEADZ_ADDRESS to .env"
        fi
        if [ "$FORGE_EXIT" -eq 0 ]; then
            echo "== deployed: $addr (recorded as BEADZ_ADDRESS in contract/.env)"
        else
            echo "== forge exited nonzero (verification may have failed) — address $addr recorded; see skill troubleshooting"
        fi
    fi
fi

exit "$FORGE_EXIT"

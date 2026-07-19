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
require_env BEADZ_ACCOUNT_PREFIX KEYSTORE_PASSWORD_FILE BEADZ_KEEPER BEADZ_TREASURY BEADZ_AIRDROP_BEADS
require_rpc
cd "$CONTRACT_DIR"

args=(script/Deploy.s.sol:DeployBeadz --rpc-url "$BEADZ_RPC_URL"
      --account "$(acct deployer)" --password-file "$KEYSTORE_PASSWORD_FILE")
if [ "${1:-}" = "--broadcast" ]; then
    args+=(--broadcast)
    if [ -n "${ETHERSCAN_API_KEY:-}" ] && [ "$CHAIN_ID" != "31337" ]; then
        args+=(--verify --etherscan-api-key "$ETHERSCAN_API_KEY")
    fi
else
    echo "== DRY RUN: simulation only (rerun with --broadcast to deploy for real)"
fi

forge script "${args[@]}" || die "forge script failed"

if [ "${1:-}" = "--broadcast" ]; then
    addr=$(sed -n 's/.*"contractAddress": *"\(0x[0-9a-fA-F]\{40\}\)".*/\1/p' \
        "broadcast/Deploy.s.sol/$CHAIN_ID/run-latest.json" | head -1)
    [ -n "$addr" ] || die "could not read deployed address from broadcast log"
    if grep -q '^BEADZ_ADDRESS=' .env 2>/dev/null; then
        sed -i.bak "s/^BEADZ_ADDRESS=.*/BEADZ_ADDRESS=$addr/" .env && rm -f .env.bak
    else
        echo "BEADZ_ADDRESS=$addr" >> .env
    fi
    echo "== deployed: $addr (recorded as BEADZ_ADDRESS in contract/.env)"
fi

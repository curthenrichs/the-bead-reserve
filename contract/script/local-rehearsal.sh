#!/usr/bin/env bash
# Local deployment rehearsal for Beadz.
#
# Boots a disposable Anvil chain, deploys via script/Deploy.s.sol (the same
# ceremony used for real chains), then walks the full token lifecycle and
# checks every observable against the contract's promises:
#
#   genesis state -> claim -> double-claim revert -> redeem (burn) ->
#   non-keeper attest revert -> keeper attest -> collateralization
#
# Usage:  bash script/local-rehearsal.sh        (from anywhere; cds itself)
# Env:    ANVIL_PORT  port for the disposable chain (default 8546)
#
# Exits 0 with "REHEARSAL PASSED" if every check holds; nonzero otherwise.
set -uo pipefail

PORT="${ANVIL_PORT:-8546}"
RPC="http://127.0.0.1:$PORT"
cd "$(dirname "$0")/.."

command -v forge >/dev/null 2>&1 || export PATH="$HOME/.foundry/bin:$PATH"
command -v forge >/dev/null 2>&1 || { echo "forge not found (install Foundry or add ~/.foundry/bin to PATH)"; exit 1; }

# Anvil's standard deterministic dev accounts (unlocked on the node; no keys handled).
DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
KEEPER=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
TREASURY=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
ALICE=0x90F79bf6EB2c4f870365E785982E1f101E93b906

ONE_BEAD=1000000000000000000
GENESIS_WEI=47318000000000000000000
POST_REDEEM_WEI=47317000000000000000000

anvil --port "$PORT" --silent &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null' EXIT

for _ in $(seq 1 40); do
    cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break
    sleep 0.25
done
cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 || { echo "anvil did not come up on $RPC"; exit 1; }

echo "== deploying via script/Deploy.s.sol to $RPC"
BEADZ_KEEPER=$KEEPER BEADZ_TREASURY=$TREASURY BEADZ_AIRDROP_BEADS=0 \
    forge script script/Deploy.s.sol:DeployBeadz \
    --rpc-url "$RPC" --broadcast --unlocked --sender "$DEPLOYER" >/dev/null || {
        echo "deployment failed"; exit 1; }

CHAIN_ID=$(cast chain-id --rpc-url "$RPC")
BEADZ=$(sed -n 's/.*"contractAddress": *"\(0x[0-9a-fA-F]\{40\}\)".*/\1/p' \
    "broadcast/Deploy.s.sol/$CHAIN_ID/run-latest.json" | head -1)
[ -n "$BEADZ" ] || { echo "could not read deployed address from broadcast log"; exit 1; }
echo "== Beadz at $BEADZ"

PASS=0; FAIL=0
check() { # label expected actual
    if [ "$2" = "$3" ]; then
        echo "ok   $1"; PASS=$((PASS + 1))
    else
        echo "FAIL $1 (expected: $2, got: $3)"; FAIL=$((FAIL + 1))
    fi
}
view() { cast call "$BEADZ" "$1" ${2:+"$2"} --rpc-url "$RPC" | awk '{print $1}'; }
send_as() { # from sig [args...]
    local from="$1"; shift
    cast send "$BEADZ" "$@" --unlocked --from "$from" --rpc-url "$RPC" >/dev/null 2>&1
}
expect_revert() { # label from sig [args...] -- must fail
    local label="$1"; shift
    if send_as "$@"; then
        echo "FAIL $label (call unexpectedly succeeded)"; FAIL=$((FAIL + 1))
    else
        echo "ok   $label"; PASS=$((PASS + 1))
    fi
}

# genesis state
check "totalSupply is exactly genesis"        "$GENESIS_WEI" "$(view 'totalSupply()(uint256)')"
check "claim pile holds all 47318 beads"      "47318"        "$(view 'unclaimedBeads()(uint256)')"
check "redemption window open at genesis"     "true"         "$(view 'redemptionOpen()(bool)')"
check "fully collateralized (10000 bps)"      "10000"        "$(view 'collateralizationBps()(uint256)')"
check "keeper wired"                          "$KEEPER"      "$(view 'vaultKeeper()(address)')"

# claim: one per address
send_as "$ALICE" "claim()"
check "claim transfers one bead"              "$ONE_BEAD"    "$(view 'balanceOf(address)(uint256)' "$ALICE")"
expect_revert "second claim reverts"          "$ALICE" "claim()"

# redeem: the one-way ratchet
send_as "$ALICE" "redeem(uint256,string)" "$ONE_BEAD" "rehearsal-label"
check "redeem burns supply"                   "$POST_REDEEM_WEI" "$(view 'totalSupply()(uint256)')"
check "redeemer balance zeroed"               "0"            "$(view 'balanceOf(address)(uint256)' "$ALICE")"

# keeper role: powerless for others, works for the keeper
expect_revert "non-keeper cannot attest"      "$ALICE" "attestBeadCount(uint256)" 999999
send_as "$KEEPER" "attestBeadCount(uint256)" 47317
check "keeper attestation recorded"           "47317"        "$(view 'attestedBeads()(uint256)')"
check "still fully collateralized post-ship"  "10000"        "$(view 'collateralizationBps()(uint256)')"

# keeper anchors a reserve record (event-only)
if send_as "$KEEPER" "attestReserveRecord(bytes32,string)" \
    0x6265616432303236000000000000000000000000000000000000000000000000 "rehearsal-record"; then
    echo "ok   keeper anchors reserve record"; PASS=$((PASS + 1))
else
    echo "FAIL keeper anchors reserve record"; FAIL=$((FAIL + 1))
fi

echo
if [ "$FAIL" -eq 0 ]; then
    echo "REHEARSAL PASSED ($PASS checks)"
else
    echo "REHEARSAL FAILED ($FAIL of $((PASS + FAIL)) checks failed)"
    exit 1
fi

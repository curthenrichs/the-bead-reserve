#!/usr/bin/env bash
# Mainnet deploy preflight for Beadz. Phase-gated; halts on the FIRST failure.
# Machine checks verify; human gates demand typed confirmation phrases.
# The abort rule: any mismatch at any gate is a full stop. Recovery is
# redeploy, never improvising forward.
#
# Usage:
#   preflight.sh a    Phase A: code freeze (tests, slither gate, rehearsal, git, docs surface)
#   preflight.sh c    Phase C: wallet validation (address derivation/comparison, dust round-trips)
#   preflight.sh e    Phase E: tripwire ceremony + env checks (run immediately before deploy)
#   preflight.sh f    Phase F: POST-deploy verification of on-chain state
#
# Phases B and D (Sepolia evidence, constructor sign-off) live in the runbook:
# they are judgment gates, prompted for here only as confirmation phrases.
#
# Env: PF_KEEPER_ACCOUNT (default beadz-mainnet-keeper); PF_PASSWORD_FILE — test
# rehearsals ONLY; a real mainnet run MUST omit it so cast prompts interactively.
set -uo pipefail
. "$(dirname "$0")/common.sh"

PF_KEEPER_ACCOUNT="${PF_KEEPER_ACCOUNT:-beadz-mainnet-keeper}"
PW_ARGS=()
[ -n "${PF_PASSWORD_FILE:-}" ] && PW_ARGS=(--password-file "$PF_PASSWORD_FILE")

ok()   { echo "ok   $*"; }
gate() { # gate <label> <command...>  — run, halt on failure
    local label="$1"; shift
    if "$@"; then ok "$label"; else die "GATE FAILED: $label"; fi
}
confirm_phrase() { # confirm_phrase <exact phrase>
    echo
    echo ">>> SIGN-OFF REQUIRED. Type exactly:"
    echo ">>>   $1"
    printf ">>> "
    local line; IFS= read -r line
    [ "$line" = "$1" ] || die "sign-off phrase mismatch — full stop"
    ok "signed off: $1"
}
ask() { # ask <prompt> -> $REPLY
    printf "%s: " "$1"; IFS= read -r REPLY
    [ -n "$REPLY" ] || die "empty entry — full stop"
}
checksum_ok() { # checksum_ok <addr> — EIP-55: checksummed form must equal input
    [ "$(cast to-check-sum-address "$1" 2>/dev/null)" = "$1" ]
}
receipt_field() { # receipt_field <tx> <field>
    cast receipt "$1" "$2" --rpc-url "$BEADZ_RPC_URL" 2>/dev/null
}
# status_ok <status-field-text> — cast's `receipt <tx> status` text has varied
# across Foundry releases ("1 (success)" on older builds, "true" on newer);
# accept either so this gate isn't a version trap.
status_ok() { [ "$1" = "1 (success)" ] || [ "$1" = "true" ]; }
dust_roundtrip() { # dust_roundtrip <name> <addr>
    local name="$1" addr="$2" txin txout
    ask "$name dust-IN tx hash (you sent ~\$1 of ETH TO this wallet)"; txin="$REPLY"
    gate "$name dust-in succeeded"      status_ok "$(receipt_field "$txin" status)"
    gate "$name dust-in went to wallet" test "$(receipt_field "$txin" to | tr 'A-F' 'a-f')" = "$(echo "$addr" | tr 'A-F' 'a-f')"
    ask "$name dust-OUT tx hash (this wallet SIGNED a send back out)"; txout="$REPLY"
    gate "$name dust-out succeeded"       status_ok "$(receipt_field "$txout" status)"
    gate "$name dust-out came from wallet" test "$(receipt_field "$txout" from | tr 'A-F' 'a-f')" = "$(echo "$addr" | tr 'A-F' 'a-f')"
}

phase_a() {
    echo "== PHASE A: code freeze"
    cd "$CONTRACT_DIR"
    gate "forge test suite green" forge test
    bash script/run-slither.sh --gate 2>&1 | tee /tmp/pf-slither.txt >/dev/null
    gate "slither publish gate (no Medium/High)" grep -q "gate exit=0" /tmp/pf-slither.txt
    bash script/local-rehearsal.sh 2>&1 | tee /tmp/pf-rehearsal.txt >/dev/null
    gate "local rehearsal passed" grep -q "REHEARSAL PASSED" /tmp/pf-rehearsal.txt
    gate "worktree clean" test -z "$(git status --porcelain)"
    git fetch origin >/dev/null 2>&1
    gate "HEAD is pushed (ancestor of origin/main)" git merge-base --is-ancestor HEAD origin/main
    gate "HEAD is release-tagged" git describe --exact-match --tags HEAD
    local fn
    for fn in claim surrender redeem attestBeadCount attestReserveRecord acknowledgeRedemption \
              setRedemptionDeadline transferVaultKeeper ReserveRecordAttested; do
        gate "README documents $fn" grep -q "$fn" "$(git rev-parse --show-toplevel)/README.md"
    done
    echo "== PHASE A PASSED"
}

phase_c() {
    echo "== PHASE C: wallet validation"
    require_env BEADZ_KEEPER BEADZ_TREASURY
    require_rpc
    local k_ks k_mm t1 t2
    k_ks=$(cast wallet address --account "$PF_KEEPER_ACCOUNT" "${PW_ARGS[@]}") || die "cannot open keeper keystore"
    ask "keeper address AS SHOWN IN METAMASK (copy from the extension)"; k_mm="$REPLY"
    gate "keeper: keystore == MetaMask" test "$k_ks" = "$k_mm"
    gate "keeper: EIP-55 checksum valid" checksum_ok "$k_ks"
    gate "keeper: .env BEADZ_KEEPER matches" test "$BEADZ_KEEPER" = "$k_ks"
    ask "treasury address AS READ FROM THE HARDWARE WALLET SCREEN (1st entry)"; t1="$REPLY"
    ask "treasury address again (2nd independent entry — do not paste)"; t2="$REPLY"
    gate "treasury: double entry matches" test "$t1" = "$t2"
    gate "treasury: EIP-55 checksum valid" checksum_ok "$t1"
    gate "treasury: .env BEADZ_TREASURY matches" test "$BEADZ_TREASURY" = "$t1"
    dust_roundtrip "keeper" "$k_ks"
    dust_roundtrip "treasury" "$t1"
    confirm_phrase "I OPENED THE KEEPER KEYSTORE USING ONLY THE PASSWORD MANAGER COPY"
    confirm_phrase "I RAN THE HARDWARE WALLET RECOVERY CHECK AND IT PASSED"
    confirm_phrase "I KNOW WHERE THE PAPER SEED IS AND IT IS NOT DIGITAL"
    echo "== PHASE C PASSED"
}

phase_e() {
    echo "== PHASE E: tripwire ceremony (run immediately before deploy)"
    # Read the chain id WITHOUT tripping the guard: env-prefix applies only to this
    # one read-only call; nothing is broadcast by require_rpc.
    BEADZ_ALLOW_MAINNET=1 require_rpc
    confirm_phrase "I PERSONALLY RAN THE FULL SEPOLIA CEREMONY END TO END"
    confirm_phrase "I HAVE SIGNED OFF EVERY CONSTRUCTOR ARGUMENT AGAINST THE DRY RUN"
    if [ "$CHAIN_ID" = "8453" ]; then
        if grep -q '^BEADZ_ALLOW_MAINNET=1' "$CONTRACT_DIR/.env" 2>/dev/null; then
            echo "flag already present in .env: treating this as the SECOND pass"
        else
            # Probe: with the override forced ABSENT, the guard must refuse chain 8453.
            local probe
            probe=$(BEADZ_ALLOW_MAINNET=0 bash -c '. "'"$CONTRACT_DIR"'/script/common.sh"; require_rpc' 2>&1)
            gate "mainnet tripwire fires without override" grep -q "Base MAINNET" <<<"$probe"
        fi
    else
        echo "SKIP tripwire probe (chain $CHAIN_ID is not mainnet — rehearsal mode)"
    fi
    gate "ETHERSCAN_API_KEY present" test -n "${ETHERSCAN_API_KEY:-}"
    confirm_phrase "NO POOL WILL BE SEEDED AND NONE ENDORSED"
    confirm_phrase "THE ANNOUNCEMENT EMBARGO HOLDS UNTIL THE LAUNCH DECISION"
    if grep -q '^BEADZ_ALLOW_MAINNET=1' "$CONTRACT_DIR/.env" 2>/dev/null; then
        ok "BEADZ_ALLOW_MAINNET=1 is set — phase E complete; proceed to deploy.sh"
    else
        echo
        echo "The sign-off act: ADD  BEADZ_ALLOW_MAINNET=1  to contract/.env YOURSELF,"
        echo "then rerun phase e — it will confirm the flag and finish."
        echo "== PHASE E: waiting on your flag (this is the expected stop on the first pass)"
    fi
}

phase_f() {
    echo "== PHASE F: post-deploy verification"
    require_env BEADZ_ADDRESS BEADZ_KEEPER BEADZ_TREASURY BEADZ_AIRDROP_BEADS
    require_rpc
    v() { cast call "$BEADZ_ADDRESS" "$1" --rpc-url "$BEADZ_RPC_URL" | awk '{print $1}'; }
    local supply treasury_bal pile deadline now
    supply=$(v 'totalSupply()(uint256)')
    gate "totalSupply == 47318 beads" test "$supply" = "47318000000000000000000"
    treasury_bal=$(cast call "$BEADZ_ADDRESS" 'balanceOf(address)(uint256)' "$BEADZ_TREASURY" --rpc-url "$BEADZ_RPC_URL" | awk '{print $1}')
    gate "treasury holds the airdrop split" test "$treasury_bal" = "$(cast to-wei "$BEADZ_AIRDROP_BEADS" ether)"
    pile=$(cast call "$BEADZ_ADDRESS" 'balanceOf(address)(uint256)' "$BEADZ_ADDRESS" --rpc-url "$BEADZ_RPC_URL" | awk '{print $1}')
    # bc is present in Git Bash but not guaranteed on every machine; fall back
    # to python's arbitrary-precision ints for the same exact-integer addition.
    local pile_sum
    if command -v bc >/dev/null 2>&1; then
        pile_sum=$(echo "$treasury_bal + $pile" | bc)
    else
        pile_sum=$(python3 -c "print($treasury_bal + $pile)" 2>/dev/null || python -c "print($treasury_bal + $pile)")
    fi
    gate "claim pile is the remainder" test "$pile_sum" = "$supply"
    gate "vaultKeeper is the validated keeper" test "$(cast call "$BEADZ_ADDRESS" 'vaultKeeper()(address)' --rpc-url "$BEADZ_RPC_URL")" = "$BEADZ_KEEPER"
    gate "fully collateralized (10000 bps)" test "$(v 'collateralizationBps()(uint256)')" = "10000"
    gate "redemption open" test "$(cast call "$BEADZ_ADDRESS" 'redemptionOpen()(bool)' --rpc-url "$BEADZ_RPC_URL")" = "true"
    deadline=$(v 'redemptionDeadline()(uint256)'); now=$(cast block latest --field timestamp --rpc-url "$BEADZ_RPC_URL")
    gate "deadline ~= now + 365d" test "$deadline" -gt "$((now + 364*86400))" -a "$deadline" -lt "$((now + 366*86400))"
    confirm_phrase "BASESCAN SHOWS THE SOURCE AS VERIFIED"
    echo "Next: first attestation — run: ops.sh attest 47318 ; then record the address in README + handoff."
    echo "== PHASE F PASSED"
}

case "${1:-}" in
a) phase_a ;;
c) phase_c ;;
e) phase_e ;;
f) phase_f ;;
*) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac

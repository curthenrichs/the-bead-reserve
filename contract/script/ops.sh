#!/usr/bin/env bash
# Lifecycle driver for a deployed Beadz contract (BEADZ_ADDRESS in .env).
# Revert reasons are printed verbatim by cast.
#
# Usage:
#   ops.sh status                                  full contract + roster view
#   ops.sh claim <role>                            claim one bead
#   ops.sh surrender <role> <beads>                return beads to the pile
#   ops.sh redeem <role> <beads> <shipping-ref>    burn for physical shipment
#   ops.sh attest <beads>                          keeper: log a recount
#   ops.sh acknowledge <role-or-address> <beads> <tracking>   keeper: log a shipment
#   ops.sh deadline <unix-timestamp>               keeper: extend/reopen window
#   ops.sh record <merkle-root> <uri>              keeper: anchor a reserve record
#   ops.sh rotate <to-role>                        keeper: hand role to <to-role>
#
# Keeper actions sign as $BEADZ_KEEPER_ROLE (default: keeper). After a rotate,
# set BEADZ_KEEPER_ROLE=<to-role> for subsequent keeper actions.
set -uo pipefail
. "$(dirname "$0")/common.sh"
require_env BEADZ_ADDRESS BEADZ_ACCOUNT_PREFIX BEADZ_WALLETS
require_rpc
[ "$(cast code "$BEADZ_ADDRESS" --rpc-url "$BEADZ_RPC_URL")" != "0x" ] || die "no contract code at BEADZ_ADDRESS (stale address? redeploy?)"
K_ROLE="${BEADZ_KEEPER_ROLE:-keeper}"

view() { cast call "$BEADZ_ADDRESS" "$@" --rpc-url "$BEADZ_RPC_URL"; }
num()  { view "$@" | awk '{print $1}'; }
wei()  { cast to-wei "$1" ether; }   # beads share ether's 18 decimals
bearer_addr() { # <role-or-0xaddress> — third parties are raw addresses, roles are local keystores
    case "$1" in
        0x*)
            local cs lower
            cs=$(cast to-check-sum-address "$1" 2>/dev/null) || die "invalid address: $1"
            lower=$(printf '%s' "$1" | tr 'A-F' 'a-f')
            if [ "$1" != "$lower" ] && [ "$1" != "$cs" ]; then
                die "address case does not match EIP-55 checksum: $1"
            fi
            echo "$1" ;;
        *)   addr_of "$1" || exit 1 ;;
    esac
}

usage() { sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

cmd="${1:-}"; [ $# -gt 0 ] && shift
case "$cmd" in

status)
    echo "Beadz @ $BEADZ_ADDRESS (chain $CHAIN_ID)"
    echo "  supply (bead-wei):   $(num 'totalSupply()(uint256)')"
    echo "  unclaimed beads:     $(num 'unclaimedBeads()(uint256)')"
    echo "  attested beads:      $(num 'attestedBeads()(uint256)')"
    echo "  collateral (bps):    $(num 'collateralizationBps()(uint256)')"
    echo "  redemption open:     $(view 'redemptionOpen()(bool)')"
    echo "  deadline (unix):     $(num 'redemptionDeadline()(uint256)')"
    echo "  vault keeper:        $(view 'vaultKeeper()(address)')"
    echo "  keeper role in use:  $K_ROLE ($(addr_of "$K_ROLE"))"
    printf '  %-10s %-44s %-12s %-26s %s\n' ROLE ADDRESS ETH 'BEADZ (wei)' CLAIMED
    for role in $BEADZ_WALLETS; do
        addr=$(addr_of "$role") || exit 1
        printf '  %-10s %-44s %-12s %-26s %s\n' "$role" "$addr" \
            "$(cast balance "$addr" --rpc-url "$BEADZ_RPC_URL" --ether)" \
            "$(num 'balanceOf(address)(uint256)' "$addr")" \
            "$(view 'hasClaimed(address)(bool)' "$addr")"
    done
    ;;

claim)       send_as "${1:?usage: ops.sh claim <role>}" "$BEADZ_ADDRESS" "claim()" ;;
surrender)   send_as "${1:?role}" "$BEADZ_ADDRESS" "surrender(uint256)" "$(wei "${2:?beads}")" ;;
redeem)      send_as "${1:?role}" "$BEADZ_ADDRESS" "redeem(uint256,string)" "$(wei "${2:?beads}")" "${3:?shipping-ref}" ;;
attest)      send_as "$K_ROLE" "$BEADZ_ADDRESS" "attestBeadCount(uint256)" "${1:?beads}" ;;
acknowledge) send_as "$K_ROLE" "$BEADZ_ADDRESS" "acknowledgeRedemption(address,uint256,string)" \
                 "$(bearer_addr "${1:?role-or-address}")" "${2:?beads}" "${3:?tracking}" ;;
deadline)    send_as "$K_ROLE" "$BEADZ_ADDRESS" "setRedemptionDeadline(uint256)" "${1:?unix-timestamp}" ;;
record)      send_as "$K_ROLE" "$BEADZ_ADDRESS" "attestReserveRecord(bytes32,string)" "${1:?merkle-root}" "${2:?uri}" ;;
rotate)
    to_addr=$(addr_of "${1:?to-role}") || exit 1
    send_as "$K_ROLE" "$BEADZ_ADDRESS" "transferVaultKeeper(uint8,address,address)" 0 "$to_addr" "$to_addr" \
        || die "rotate failed"
    echo "rotated to '$1' — keeper actions now need: BEADZ_KEEPER_ROLE=$1 ops.sh <cmd>"
    ;;

*) usage ;;
esac

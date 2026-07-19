#!/usr/bin/env bash
# Role-wallet manager for the Beadz ops scripts. One encrypted Foundry
# keystore per role; private keys are never printed.
#
# Usage:
#   wallets.sh create             create missing keystores for all BEADZ_WALLETS
#                                 (generates KEYSTORE_PASSWORD_FILE if absent)
#   wallets.sh status             role -> address -> ETH balance table
#   wallets.sh disperse [amount]  send gas from deployer to every other role
#                                 (default 0.02ether each)
set -uo pipefail
. "$(dirname "$0")/common.sh"
require_env BEADZ_ACCOUNT_PREFIX BEADZ_WALLETS KEYSTORE_PASSWORD_FILE

usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

cmd="${1:-}"; [ $# -gt 0 ] && shift
case "$cmd" in

create)
    if [ ! -f "$KEYSTORE_PASSWORD_FILE" ]; then
        mkdir -p "$(dirname "$KEYSTORE_PASSWORD_FILE")"
        (umask 177; od -An -N24 -tx1 /dev/urandom | tr -d ' \n' > "$KEYSTORE_PASSWORD_FILE")
        echo "generated $KEYSTORE_PASSWORD_FILE (mode 600)"
        echo ">>> BACK UP its contents in your password manager now. <<<"
    fi
    for role in $BEADZ_WALLETS; do
        name=$(acct "$role")
        if [ -f "$(keystore_file "$role")" ]; then
            echo "exists   $name"
            continue
        fi
        json=$(cast wallet new --json) || die "cast wallet new failed"
        key=$(printf '%s' "$json" | sed -n 's/.*"private_key": *"\(0x[0-9a-fA-F]*\)".*/\1/p')
        addr=$(printf '%s' "$json" | sed -n 's/.*"address": *"\(0x[0-9a-fA-F]*\)".*/\1/p')
        [ -n "$key" ] && [ -n "$addr" ] || die "could not parse cast wallet new output"
        cast wallet import "$name" --private-key "$key" \
            --unsafe-password "$(cat "$KEYSTORE_PASSWORD_FILE")" >/dev/null \
            || die "keystore import failed for $name"
        unset key json
        echo "created  $name  $addr"
    done
    ;;

status)
    require_rpc
    printf '%-10s %-44s %s\n' ROLE ADDRESS 'BALANCE (ETH)'
    for role in $BEADZ_WALLETS; do
        addr=$(addr_of "$role") || exit 1
        printf '%-10s %-44s %s\n' "$role" "$addr" \
            "$(cast balance "$addr" --rpc-url "$BEADZ_RPC_URL" --ether)"
    done
    ;;

disperse)
    require_rpc
    amount="${1:-0.02ether}"
    for role in $BEADZ_WALLETS; do
        [ "$role" = deployer ] && continue
        addr=$(addr_of "$role") || exit 1
        echo "== $amount -> $role ($addr)"
        send_as deployer "$addr" --value "$amount" >/dev/null \
            || die "disperse to $role failed (is deployer funded?)"
    done
    echo "done; run: wallets.sh status"
    ;;

*) usage ;;
esac

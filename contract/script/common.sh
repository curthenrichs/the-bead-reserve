#!/usr/bin/env bash
# Shared helpers for the Beadz ops scripts (wallets.sh, deploy.sh, ops.sh).
# Sourced, not executed. Loads contract/.env (see .env.example).

command -v forge >/dev/null 2>&1 || export PATH="$HOME/.foundry/bin:$PATH"
command -v cast >/dev/null 2>&1 || { echo "error: Foundry not found (install it or add ~/.foundry/bin to PATH)" >&2; exit 1; }

CONTRACT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$CONTRACT_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$CONTRACT_DIR/.env"
    set +a
fi

die() { echo "error: $*" >&2; exit 1; }

require_env() {
    local v
    for v in "$@"; do
        [ -n "${!v:-}" ] || die "missing env var $v (copy .env.example to .env and fill it in)"
    done
}

require_rpc() {
    require_env BEADZ_RPC_URL
    cast chain-id --rpc-url "$BEADZ_RPC_URL" >/dev/null 2>&1 || die "RPC unreachable: $BEADZ_RPC_URL"
    CHAIN_ID=$(cast chain-id --rpc-url "$BEADZ_RPC_URL")
}

acct() { echo "$BEADZ_ACCOUNT_PREFIX-$1"; }
keystore_file() { echo "$HOME/.foundry/keystores/$(acct "$1")"; }

addr_of() {
    cast wallet address --account "$(acct "$1")" --password-file "$KEYSTORE_PASSWORD_FILE" 2>/dev/null \
        || die "cannot open keystore for role '$1' (run: wallets.sh create)"
}

# send_as <role> <cast-send-args...> — a transaction signed by the role's keystore.
send_as() {
    local role="$1"; shift
    cast send "$@" --rpc-url "$BEADZ_RPC_URL" \
        --account "$(acct "$role")" --password-file "$KEYSTORE_PASSWORD_FILE"
}

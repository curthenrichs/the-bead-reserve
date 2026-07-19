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
    if [ "$CHAIN_ID" = "8453" ] && [ "${BEADZ_ALLOW_MAINNET:-0}" != "1" ]; then
        die "chain 8453 is Base MAINNET — refusing. Set BEADZ_ALLOW_MAINNET=1 only with explicit sign-off."
    fi
}

acct() {
    local o="BEADZ_ACCOUNT_${1//[^A-Za-z0-9_]/_}"
    if [ -n "${!o:-}" ]; then echo "${!o}"; return; fi
    echo "$BEADZ_ACCOUNT_PREFIX-$1"
}
keystore_file() { echo "$HOME/.foundry/keystores/$(acct "$1")"; }

# PW_OPTS: --password-file args when KEYSTORE_PASSWORD_FILE is set; empty
# (interactive cast/forge password prompt) otherwise — the mainnet posture.
PW_OPTS=()
[ -n "${KEYSTORE_PASSWORD_FILE:-}" ] && PW_OPTS=(--password-file "$KEYSTORE_PASSWORD_FILE")

addr_of() {
    # No 2>/dev/null: with no password file, cast prompts interactively on the
    # controlling terminal and that prompt must not be swallowed.
    cast wallet address --account "$(acct "$1")" "${PW_OPTS[@]}" \
        || die "cannot open keystore '$(acct "$1")' (create or import it first; testnet rosters: wallets.sh create)"
}

# send_as <role> <cast-send-args...> — a transaction signed by the role's keystore.
send_as() {
    local role="$1"; shift
    cast send "$@" --rpc-url "$BEADZ_RPC_URL" \
        --account "$(acct "$role")" "${PW_OPTS[@]}"
}

# BEADZ contract

Foundry project for the BEADZ ERC-20 (`src/Beadz.sol`), the on-chain half of The Bead Reserve.
The [repository README](../README.md) explains what the project is; this file covers building,
testing, analyzing, and deploying the contract itself.

## Design in one paragraph

The entire supply (47,318 BEADZ, one per bead in the jar) is minted once, in the constructor.
There is no `mint` function, so supply can only shrink: `redeem()` burns tokens in exchange for
a physical shipment of beads. Distribution happens through `claim()`, one bead per address, out
of a pre-minted pile held by the contract; `surrender()` returns beads to that pile. The Vault
Keeper role can log bead recounts, acknowledge shipments, widen (never shorten) the redemption
window, and rotate or permanently freeze its own key. It cannot mint, move, or seize anyone's
balance, and there is no admin recovery path: a lost keeper key means redeploying a fresh
contract, not rescuing the old one. The NatSpec in `Beadz.sol` is the full design document.

## Layout

| Path | Contents |
|---|---|
| `src/Beadz.sol` | The token contract |
| `test/Beadz.t.sol` | Unit and fuzz tests |
| `test/BeadzInvariants.t.sol` | Invariant suite driven by a randomized handler; checks that supply only ever shrinks and that an open redemption window is never shortened |
| `script/Deploy.s.sol` | Deployment script; constructor arguments come from environment variables |
| `script/local-rehearsal.sh` | Deploys to a disposable Anvil chain and walks the full token lifecycle |
| `script/run-slither.sh` | Bootstraps Slither and runs the detector policy in `slither.config.json` |

## Toolchain

Solidity 0.8.24 (pinned in `foundry.toml`), OpenZeppelin Contracts v5.1.0 vendored under
`lib/`, and Foundry for build, test, and deploy. Fuzz tests run 256 iterations; the invariant
suite runs 128 sequences at depth 32.

## Build and test

```bash
forge build
forge test                              # unit + fuzz + invariant
forge test --match-test testName -vvv   # a single test, verbose
```

## Static analysis

```bash
slither . --config-file slither.config.json   # if slither is already installed
bash script/run-slither.sh                    # bootstraps slither + solc 0.8.24 first
bash script/run-slither.sh --gate             # publish gate: fails on Medium/High findings
```

Detector policy lives only in `slither.config.json`; the script handles toolchain setup and
never overrides it.

## Deployment

`script/Deploy.s.sol` reads the constructor arguments from the environment, so the same script
is the deployment ceremony on every chain and no address is ever hand-typed at deploy time:

| Variable | Meaning |
|---|---|
| `BEADZ_KEEPER` | Initial Vault Keeper. Use a dedicated low-value hot wallet; the role controls no tokens. |
| `BEADZ_TREASURY` | Recipient of the discretionary airdrop allocation. Use a cold wallet, not the deployer. |
| `BEADZ_AIRDROP_BEADS` | Whole beads carved from the fixed supply into the treasury. `0` means a pure open claim. |

Simulate first, then broadcast:

```bash
forge script script/Deploy.s.sol --rpc-url "$RPC_URL"                      # dry run
forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --broadcast --verify
```

Every dry run exercises the exact code path of the real deploy, so treat it as a free dress
rehearsal. For a fuller one on a live local node:

```bash
bash script/local-rehearsal.sh   # boots Anvil, deploys, then checks the lifecycle:
                                 # genesis state -> claim -> double-claim revert ->
                                 # redeem (burn) -> non-keeper attest revert ->
                                 # keeper attest -> collateralization
```

The script exits 0 and prints `REHEARSAL PASSED` when every check holds.

Deployment order is Anvil rehearsal, then Base Sepolia, then Base mainnet. The first
`attestBeadCount` is deliberately not part of the deploy script: attestation is a separate
keeper-signed act, so the keeper key never needs to be present at deployment.

## License

MIT, same as the rest of the repository.

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {Beadz} from "../src/Beadz.sol";

/**
 * @title  DeployBeadz
 * @notice Deploys the Beadz contract with constructor parameters taken from the
 *         environment, so the same script is the deployment ceremony on every
 *         chain (local Anvil, Base Sepolia, Base mainnet) and no address is ever
 *         hand-typed at deploy time.
 *
 *         Required environment variables:
 *           BEADZ_KEEPER         initial Vault Keeper (low-value hot wallet)
 *           BEADZ_TREASURY       discretionary-allocation recipient (cold wallet)
 *           BEADZ_AIRDROP_BEADS  whole beads carved to the treasury (0 = pure open claim)
 *
 *         Run without --broadcast first: forge simulates the deployment and
 *         prints the resulting address, gas, and events, so every real deploy is
 *         preceded by a free dress rehearsal of the exact same code path.
 *
 * @dev    Deliberately deploy-only. The first attestBeadCount is a separate,
 *         keeper-signed act (mirroring the capture-vs-attest separation elsewhere
 *         in the project), so the keeper key never needs to be present here.
 */
contract DeployBeadz is Script {
    function run() external returns (Beadz beadz) {
        address keeper = vm.envAddress("BEADZ_KEEPER");
        address treasury = vm.envAddress("BEADZ_TREASURY");
        uint256 airdropBeads = vm.envUint("BEADZ_AIRDROP_BEADS");

        vm.startBroadcast();
        beadz = new Beadz(keeper, treasury, airdropBeads);
        vm.stopBroadcast();
    }
}

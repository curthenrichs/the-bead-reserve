// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Beadz} from "../src/Beadz.sol";

/// @dev Drives bounded, realistic actions against Beadz and records ghost state
///      the invariants check. All supply starts in the treasury so redeem() is exercisable.
contract BeadzHandler is Test {
    Beadz public beadz;
    address public keeper;
    address[] internal actors;

    uint256 public maxSupplySeen;      // ghost: highest totalSupply observed
    uint256 public lastDeadline;       // ghost: last observed deadline
    bool public everShortenedWhileOpen; // ghost: violated guarantee flag

    constructor(Beadz _beadz, address _keeper, address _treasury) {
        beadz = _beadz;
        keeper = _keeper;
        maxSupplySeen = _beadz.totalSupply();
        lastDeadline = _beadz.redemptionDeadline();
        // seed a small actor set, funded from treasury
        for (uint256 i = 0; i < 4; i++) {
            address a = address(uint160(0x1000 + i));
            actors.push(a);
            vm.prank(_treasury);
            beadz.transfer(a, 500e18); // enough to redeem in lots
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function redeem(uint256 actorSeed, uint256 lots) external {
        address a = _actor(actorSeed);
        uint256 bal = beadz.balanceOf(a);
        if (bal < beadz.MIN_REDEMPTION()) return;
        lots = bound(lots, 1, bal / 1e18);
        uint256 amount = (lots * 1e18);
        if (amount < beadz.MIN_REDEMPTION()) return;
        if (block.timestamp > beadz.redemptionDeadline()) return;
        vm.prank(a);
        beadz.redeem(amount, "fuzz");
        if (beadz.totalSupply() > maxSupplySeen) maxSupplySeen = beadz.totalSupply();
    }

    function claim(uint256 actorSeed) external {
        address a = _actor(actorSeed);
        if (beadz.hasClaimed(a)) return;
        if (beadz.balanceOf(address(beadz)) < beadz.CLAIM_AMOUNT()) return;
        vm.prank(a);
        beadz.claim();
    }

    function setDeadline(uint256 rawTarget) external {
        uint256 prev = beadz.redemptionDeadline();
        bool wasOpen = block.timestamp <= prev;
        // Deliberately allow targets that would SHORTEN an open window (prev - X) as well as
        // extend it, so the fuzzer actively tries to violate the guarantee. The contract must
        // reject the illegal ones; try/catch keeps a legitimate revert from aborting the run.
        uint256 target = bound(rawTarget, block.timestamp + 1, block.timestamp + 400 days);
        vm.prank(keeper);
        try beadz.setRedemptionDeadline(target) {
            // accepted
        } catch {
            // rejected (e.g. an attempted shorten) — expected for illegal targets
        }
        uint256 nowDeadline = beadz.redemptionDeadline();
        // If the window was open and its deadline actually moved earlier, the guarantee broke.
        if (wasOpen && nowDeadline < prev) everShortenedWhileOpen = true;
        lastDeadline = nowDeadline;
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 1, 30 days));
    }
}

contract BeadzInvariants is Test {
    Beadz internal beadz;
    BeadzHandler internal handler;
    uint256 internal genesisSupply;

    function setUp() public {
        address keeper = makeAddr("keeper");
        address treasury = makeAddr("treasury");
        beadz = new Beadz(keeper, treasury, 47_318); // entire supply to treasury
        genesisSupply = beadz.totalSupply();
        handler = new BeadzHandler(beadz, keeper, treasury);
        targetContract(address(handler));
    }

    /// Supply can never inflate: no mint path exists after genesis.
    function invariant_supplyNeverExceedsGenesis() public view {
        assertLe(beadz.totalSupply(), genesisSupply);
    }

    /// The redemption right cannot be rugged: an open window is never shortened.
    function invariant_openWindowNeverShortened() public view {
        assertEq(handler.everShortenedWhileOpen(), false);
    }
}

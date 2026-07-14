// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Beadz} from "../src/Beadz.sol";

/// @dev Drives bounded, realistic actions against Beadz and records ghost state
///      the invariants check. The treasury holds half the genesis supply (funding actors and
///      redeem()) while the other half seeds the claim pile, so both claim() and redeem() are
///      reachable by the fuzzer.
contract BeadzHandler is Test {
    Beadz public beadz;
    address public keeper;
    address[] internal actors;

    uint256 public maxSupplySeen;       // ghost: highest totalSupply observed
    bool public everShortenedWhileOpen; // ghost: violated guarantee flag

    constructor(Beadz _beadz, address _keeper, address _treasury, uint256 treasuryBeads) {
        beadz = _beadz;
        keeper = _keeper;
        maxSupplySeen = _beadz.totalSupply();
        // seed a small actor set, funded from treasury — keep total funding well below the
        // treasury's balance (treasuryBeads whole beads) so redeem() lots stay exercisable.
        uint256 perActor = (treasuryBeads * 1e18) / 40; // 4 actors ≈ 1/10 of the treasury, total
        for (uint256 i = 0; i < 4; i++) {
            address a = address(uint160(0x1000 + i));
            actors.push(a);
            vm.prank(_treasury);
            beadz.transfer(a, perActor);
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
        _trackMaxSupply();
    }

    function claim(uint256 actorSeed) external {
        address a = _actor(actorSeed);
        if (beadz.hasClaimed(a)) return;
        if (beadz.balanceOf(address(beadz)) < beadz.CLAIM_AMOUNT()) return;
        vm.prank(a);
        beadz.claim();
        _trackMaxSupply();
    }

    /// @dev Returns a bounded portion of an actor's balance to the claim pile, refilling it so
    ///      claim() keeps having something to draw from instead of always early-returning once the
    ///      pile drains. Only reopens the actor's own claim door (via `hasClaimed` reset) when the
    ///      returned amount is a whole bead or more; sub-bead amounts just donate to the pile.
    function surrender(uint256 actorSeed, uint256 amount) external {
        address a = _actor(actorSeed);
        uint256 bal = beadz.balanceOf(a);
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        vm.prank(a);
        beadz.surrender(amount);
        _trackMaxSupply();
    }

    /// @dev Updates the ghost after any handler action that could touch supply, so
    ///      `maxSupplySeen` genuinely reflects the highest totalSupply observed on any path
    ///      (not just redeem()).
    function _trackMaxSupply() internal {
        if (beadz.totalSupply() > maxSupplySeen) maxSupplySeen = beadz.totalSupply();
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
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 1, 30 days));
        _trackMaxSupply();
    }
}

contract BeadzInvariants is Test {
    Beadz internal beadz;
    BeadzHandler internal handler;
    uint256 internal genesisSupply;

    function setUp() public {
        address keeper = makeAddr("keeper");
        address treasury = makeAddr("treasury");
        // `Beadz.GENESIS_BEADS` (bare type-qualified access to another contract's public
        // constant) doesn't compile under this solc/forge setup, and reading it off an instance
        // would need one before `beadz` itself exists — i.e. exactly the throwaway `probe` this
        // fix removes. So the split below is a literal mirroring GENESIS_BEADS (47_318) in
        // src/Beadz.sol; every other read of the constant in this file (see `genesisSupply`
        // just below) comes from the one real, permanently-used `beadz` instance, not a probe.
        uint256 airdropBeads = 23_659; // GENESIS_BEADS / 2 = 47_318 / 2 (floor): claim pile AND treasury both nonzero
        beadz = new Beadz(keeper, treasury, airdropBeads);
        genesisSupply = beadz.totalSupply();
        handler = new BeadzHandler(beadz, keeper, treasury, airdropBeads);
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

    /// Cross-check on the no-mint guarantee via an independently maintained ghost: the highest
    /// totalSupply ever observed by the handler should never have risen past genesis.
    function invariant_supplyNeverRoseAboveGenesis() public view {
        assertEq(handler.maxSupplySeen(), genesisSupply);
    }
}

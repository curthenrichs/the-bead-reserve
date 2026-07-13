// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Beadz} from "../src/Beadz.sol";

contract BeadzTest is Test {
    Beadz internal beadz;
    address internal keeper = makeAddr("keeper");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        beadz = new Beadz(keeper, treasury, 0); // pure open claim: whole supply in the contract
    }

    // Deploy a variant with the entire supply airdropped to treasury, for redeem tests.
    function _allToTreasury() internal returns (Beadz b) {
        b = new Beadz(keeper, treasury, beadz.GENESIS_BEADS());
    }

    // --- claim ---

    function test_claim_transfersOneBead() public {
        vm.prank(alice);
        beadz.claim();
        assertEq(beadz.balanceOf(alice), beadz.CLAIM_AMOUNT());
    }

    function test_claim_revertsOnSecondClaim() public {
        vm.prank(alice);
        beadz.claim();
        vm.prank(alice);
        vm.expectRevert("BEADZ: address already claimed");
        beadz.claim();
    }

    // --- surrender ---

    function test_surrender_returnsTokensWithoutBurning() public {
        vm.prank(alice);
        beadz.claim();
        uint256 supplyBefore = beadz.totalSupply();
        // Hoist the view call out of the prank slot: `vm.prank` only covers the very next
        // external call, and `beadz.CLAIM_AMOUNT()` inline as an argument would itself be
        // that next call (consuming the prank before `surrender` ever runs as alice).
        uint256 claimAmount = beadz.CLAIM_AMOUNT();
        vm.prank(alice);
        beadz.surrender(claimAmount);
        assertEq(beadz.balanceOf(alice), 0);
        assertEq(beadz.totalSupply(), supplyBefore); // no burn
    }

    function test_surrender_reopensClaim() public {
        vm.prank(alice);
        beadz.claim();
        uint256 claimAmount = beadz.CLAIM_AMOUNT(); // see note above
        vm.prank(alice);
        beadz.surrender(claimAmount);
        vm.prank(alice);
        beadz.claim(); // door reopened
        assertEq(beadz.balanceOf(alice), claimAmount);
    }

    function test_surrender_revertsOnZero() public {
        vm.prank(alice);
        vm.expectRevert("BEADZ: nothing to surrender");
        beadz.surrender(0);
    }

    // --- redeem ---

    function test_redeem_burnsSupply() public {
        Beadz b = _allToTreasury();
        // Hoisted for the same reason as the surrender tests above: a prank only covers the
        // single next external call, so `b.MIN_REDEMPTION()` must not be inlined as an argument.
        uint256 minRedemption = b.MIN_REDEMPTION();
        vm.prank(treasury);
        b.transfer(alice, minRedemption);
        uint256 supplyBefore = b.totalSupply();
        vm.prank(alice);
        b.redeem(minRedemption, "label-123");
        assertEq(b.totalSupply(), supplyBefore - minRedemption);
        assertEq(b.balanceOf(alice), 0);
    }

    function test_redeem_revertsBelowMinimum() public {
        Beadz b = _allToTreasury();
        uint256 minRedemption = b.MIN_REDEMPTION(); // see note above
        vm.prank(treasury);
        b.transfer(alice, minRedemption);
        vm.prank(alice);
        vm.expectRevert("BEADZ: below minimum redemption lot");
        b.redeem(minRedemption - 1e18, "x");
    }

    function test_redeem_revertsOnFractionalBeads() public {
        Beadz b = _allToTreasury();
        uint256 minRedemption = b.MIN_REDEMPTION(); // see note above
        vm.prank(treasury);
        b.transfer(alice, minRedemption + 1e18);
        vm.prank(alice);
        vm.expectRevert("BEADZ: whole beads only");
        b.redeem(minRedemption + 5e17, "x"); // 100.5 beads
    }

    function test_redeem_revertsWhenWindowClosed() public {
        Beadz b = _allToTreasury();
        uint256 minRedemption = b.MIN_REDEMPTION(); // see note above
        vm.prank(treasury);
        b.transfer(alice, minRedemption);
        vm.warp(b.redemptionDeadline() + 1);
        vm.prank(alice);
        vm.expectRevert("BEADZ: redemption window closed");
        b.redeem(minRedemption, "x");
    }

    // --- access control ---

    function test_attest_onlyKeeper() public {
        vm.prank(alice);
        vm.expectRevert("BEADZ: caller is not the Vault Keeper");
        beadz.attestBeadCount(100);
    }

    function test_attest_keeperSucceeds() public {
        vm.prank(keeper);
        beadz.attestBeadCount(123);
        assertEq(beadz.attestedBeads(), 123);
    }

    function test_transferVaultKeeper_rotatesKey() public {
        vm.prank(keeper);
        beadz.transferVaultKeeper(bob);
        assertEq(beadz.vaultKeeper(), bob);
        vm.prank(bob);
        beadz.attestBeadCount(7); // new keeper works
        assertEq(beadz.attestedBeads(), 7);
    }

    // --- setRedemptionDeadline ---

    function test_setDeadline_extendsOpenWindow() public {
        uint256 prev = beadz.redemptionDeadline();
        vm.prank(keeper);
        beadz.setRedemptionDeadline(prev + 10 days);
        assertEq(beadz.redemptionDeadline(), prev + 10 days);
    }

    function test_setDeadline_cannotShortenOpenWindow() public {
        uint256 prev = beadz.redemptionDeadline();
        vm.prank(keeper);
        vm.expectRevert("BEADZ: cannot shorten an open window");
        beadz.setRedemptionDeadline(prev - 1 days);
    }

    function test_setDeadline_capsExtension() public {
        uint256 prev = beadz.redemptionDeadline();
        // Hoisted for the same reason as above: `beadz.MAX_EXTENSION()` inlined as part of the
        // argument would itself be the next external call and consume the pending prank.
        uint256 tooFar = prev + beadz.MAX_EXTENSION() + 1 days;
        vm.prank(keeper);
        vm.expectRevert("BEADZ: at most one year per extension");
        beadz.setRedemptionDeadline(tooFar);
    }

    function test_setDeadline_reopensLapsedWindow() public {
        vm.warp(beadz.redemptionDeadline() + 30 days); // window lapsed
        uint256 target = block.timestamp + 100 days;
        vm.prank(keeper);
        beadz.setRedemptionDeadline(target);
        assertEq(beadz.redemptionDeadline(), target);
    }

    // --- constructor ---

    function test_constructor_revertsOnZeroKeeper() public {
        vm.expectRevert("BEADZ: keeper is the zero address");
        new Beadz(address(0), treasury, 0);
    }

    function test_constructor_revertsOnAirdropOverGenesis() public {
        // Hoisted for the same reason as above: `beadz.GENESIS_BEADS()` inlined as part of the
        // constructor argument would itself be the next external call and consume expectRevert.
        uint256 tooMany = beadz.GENESIS_BEADS() + 1;
        vm.expectRevert("BEADZ: airdrop exceeds genesis supply");
        new Beadz(keeper, treasury, tooMany);
    }

    function test_constructor_mintsExactGenesis() public view {
        assertEq(beadz.totalSupply(), beadz.GENESIS_BEADS() * 1e18);
    }

    // --- collateralizationBps ---

    function test_collateralizationBps_fullyReserved() public {
        uint256 genesisBeads = beadz.GENESIS_BEADS(); // hoisted: see prank-scoping note above
        vm.prank(keeper);
        beadz.attestBeadCount(genesisBeads);
        assertEq(beadz.collateralizationBps(), 10_000);
    }

    function test_collateralizationBps_partiallyReserved() public {
        vm.prank(keeper);
        beadz.attestBeadCount(40_000);
        // Compute the expected ratio from the getters rather than hardcoding a literal that
        // would go stale if GENESIS_BEADS or the attested count ever changed.
        uint256 attested = beadz.attestedBeads();
        uint256 outstanding = beadz.totalSupply() / 1e18;
        assertEq(beadz.collateralizationBps(), (attested * 10_000) / outstanding);
    }

    function test_collateralizationBps_emptySupplyReturnsMax() public {
        Beadz b = _allToTreasury();
        uint256 totalSupply = b.totalSupply(); // hoisted: see prank-scoping note above
        vm.prank(treasury);
        b.redeem(totalSupply, "empty-out");
        assertEq(b.totalSupply(), 0);
        assertEq(b.collateralizationBps(), type(uint256).max);
    }

    // --- setRedemptionDeadline (additional guards) ---

    function test_setDeadline_revertsOnNonFutureDeadline() public {
        vm.prank(keeper);
        vm.expectRevert("BEADZ: deadline must be in the future");
        beadz.setRedemptionDeadline(block.timestamp);
    }

    function test_setDeadline_reopenCapEnforced() public {
        vm.warp(beadz.redemptionDeadline() + 30 days); // window lapsed
        // Hoisted for the same reason as above: `beadz.MAX_EXTENSION()` inlined as part of the
        // argument would itself be the next external call and consume the pending prank.
        uint256 tooFar = block.timestamp + beadz.MAX_EXTENSION() + 1 days;
        vm.prank(keeper);
        vm.expectRevert("BEADZ: at most one year per reopen");
        beadz.setRedemptionDeadline(tooFar);
    }

    // --- acknowledgeRedemption ---

    function test_acknowledgeRedemption_onlyKeeper() public {
        vm.prank(alice);
        vm.expectRevert("BEADZ: caller is not the Vault Keeper");
        beadz.acknowledgeRedemption(bob, 5, "trk");
    }
}

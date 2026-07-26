// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Beadz} from "../src/Beadz.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract BeadzTest is Test {
    Beadz internal beadz;
    address internal keeper = makeAddr("keeper");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        beadz = new Beadz(keeper, treasury, 0); // pure open claim: whole supply in the contract
        // The faucet starts EMPTY at deploy and fills at one bead per DRIP_INTERVAL. Warp one
        // full day so the bucket sits at DRIP_CAP and pre-trickle tests keep passing unchanged.
        vm.warp(block.timestamp + 1 days);
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

    function test_surrender_dustDoesNotReopenClaim() public {
        vm.prank(alice);
        beadz.claim();
        // Surrendering 1 wei (dust, far less than a whole bead) must NOT reopen alice's claim.
        // Otherwise claim() -> surrender(1) -> claim() -> ... could drain the whole pile to one
        // address while alice keeps almost the entire bead each round.
        vm.prank(alice);
        beadz.surrender(1);
        vm.prank(alice);
        vm.expectRevert("BEADZ: address already claimed");
        beadz.claim();
    }

    // --- drip faucet ---

    function test_claim_revertsWhenFaucetEmptyAtDeploy() public {
        Beadz fresh = new Beadz(keeper, treasury, 0); // no warp after deploy: faucet empty
        vm.prank(alice);
        vm.expectRevert("BEADZ: faucet is empty");
        fresh.claim();
    }

    function test_claim_succeedsAfterFirstInterval() public {
        Beadz fresh = new Beadz(keeper, treasury, 0);
        vm.warp(block.timestamp + fresh.DRIP_INTERVAL());
        vm.prank(alice);
        fresh.claim();
        assertEq(fresh.balanceOf(alice), fresh.CLAIM_AMOUNT());
    }

    function test_drip_globalCapacitySharedAcrossAddresses() public {
        Beadz fresh = new Beadz(keeper, treasury, 0);
        vm.warp(block.timestamp + 3 * fresh.DRIP_INTERVAL()); // exactly 3 beads accrued
        for (uint256 i = 0; i < 3; i++) {
            address who = address(uint160(0x2000 + i));
            vm.prank(who);
            fresh.claim();
        }
        vm.prank(alice); // 4th fresh address in the same block: the trickle is global
        vm.expectRevert("BEADZ: faucet is empty");
        fresh.claim();
    }

    function test_drip_idleExcessForfeited() public {
        Beadz fresh = new Beadz(keeper, treasury, 0);
        vm.warp(block.timestamp + 10 days); // idle far past the one-day cap
        uint256 cap = fresh.DRIP_CAP();
        for (uint256 i = 0; i < cap; i++) {
            address who = address(uint160(0x3000 + i));
            vm.prank(who);
            fresh.claim();
        }
        vm.prank(alice); // claim #201: the 9 idle days must NOT have banked
        vm.expectRevert("BEADZ: faucet is empty");
        fresh.claim();
        vm.warp(block.timestamp + fresh.DRIP_INTERVAL()); // one interval later: exactly one more
        vm.prank(alice);
        fresh.claim();
        assertEq(fresh.balanceOf(alice), fresh.CLAIM_AMOUNT());
    }

    function test_surrender_doesNotRefundDripCapacity() public {
        Beadz fresh = new Beadz(keeper, treasury, 0);
        vm.warp(block.timestamp + fresh.DRIP_INTERVAL()); // exactly one bead accrued
        vm.prank(alice);
        fresh.claim();
        uint256 claimAmount = fresh.CLAIM_AMOUNT(); // hoisted: prank covers only the next call
        vm.prank(alice);
        fresh.surrender(claimAmount); // pile refilled — but the clock was not
        vm.prank(alice);
        vm.expectRevert("BEADZ: faucet is empty");
        fresh.claim();
    }

    function test_claim_pileExhaustedRevertWinsOverFaucet() public {
        Beadz b = _allToTreasury(); // pile is empty; the faucet accrues regardless
        vm.warp(block.timestamp + b.DRIP_INTERVAL());
        vm.prank(alice);
        vm.expectRevert("BEADZ: genesis pile exhausted");
        b.claim();
    }

    function test_claimableBeads_tracksAccrualAndCap() public {
        Beadz fresh = new Beadz(keeper, treasury, 0);
        assertEq(fresh.claimableBeads(), 0); // empty at deploy
        vm.warp(block.timestamp + fresh.DRIP_INTERVAL() - 1);
        assertEq(fresh.claimableBeads(), 0); // one second early
        vm.warp(block.timestamp + 1);
        assertEq(fresh.claimableBeads(), 1); // first drip lands exactly on the interval
        vm.warp(block.timestamp + 30 days);
        assertEq(fresh.claimableBeads(), fresh.DRIP_CAP()); // capped at one day's allotment
    }

    function test_claimableBeads_boundedByPile() public {
        Beadz b = _allToTreasury(); // pile is empty
        vm.warp(block.timestamp + 30 days);
        assertEq(b.claimableBeads(), 0); // time accrues, but there is nothing to dispense
    }

    function test_nextBeadAt_advancesOnClaim() public {
        Beadz fresh = new Beadz(keeper, treasury, 0);
        uint256 t0 = block.timestamp;
        assertEq(fresh.nextBeadAt(), t0 + fresh.DRIP_INTERVAL());
        vm.warp(t0 + fresh.DRIP_INTERVAL());
        vm.prank(alice);
        fresh.claim();
        assertEq(fresh.nextBeadAt(), t0 + 2 * fresh.DRIP_INTERVAL());
    }

    function test_dripConstants_matchPublishedSchedule() public view {
        // The whitepaper and handoff doc hardcode "one bead per 432 seconds, 200/day, 200 cap".
        // Pin the literals so the docs' numbers are regression-checked, not just the mechanism.
        assertEq(beadz.DRIP_INTERVAL(), 432);
        assertEq(beadz.DRIP_CAP(), 200);
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
        b.redeem(minRedemption + 5e17, "x"); // 1.5 beads
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
        beadz.transferVaultKeeper(Beadz.KeeperAction.Rotate, bob, bob);
        assertEq(beadz.vaultKeeper(), bob);
        vm.prank(bob);
        beadz.attestBeadCount(7); // new keeper works
        assertEq(beadz.attestedBeads(), 7);
    }

    function test_transferVaultKeeper_rotateMismatchReverts() public {
        vm.prank(keeper);
        vm.expectRevert("BEADZ: keeper address mismatch");
        beadz.transferVaultKeeper(Beadz.KeeperAction.Rotate, bob, alice);
    }

    function test_transferVaultKeeper_rotateToZeroReverts() public {
        vm.prank(keeper);
        vm.expectRevert("BEADZ: rotate requires a non-zero keeper (use Freeze to retire)");
        beadz.transferVaultKeeper(Beadz.KeeperAction.Rotate, address(0), address(0));
    }

    function test_transferVaultKeeper_freezePermanentlyDisablesKeeper() public {
        vm.prank(keeper);
        beadz.transferVaultKeeper(Beadz.KeeperAction.Freeze, address(0), address(0));
        assertEq(beadz.vaultKeeper(), address(0));
        vm.prank(keeper);
        vm.expectRevert("BEADZ: caller is not the Vault Keeper");
        beadz.attestBeadCount(1);
    }

    function test_transferVaultKeeper_freezeRequiresBothZero() public {
        vm.prank(keeper);
        vm.expectRevert("BEADZ: freeze takes the zero address in both slots");
        beadz.transferVaultKeeper(Beadz.KeeperAction.Freeze, bob, address(0));
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

    function test_constructor_revertsOnZeroTreasury() public {
        vm.expectRevert("BEADZ: treasury is the zero address");
        new Beadz(keeper, address(0), 0);
    }

    function test_constructor_splitsSupplyBetweenTreasuryAndPile() public {
        uint256 airdropBeads = 1_000;
        Beadz b = new Beadz(keeper, treasury, airdropBeads);
        // Pin the split itself, not just the total: a swapped-recipient or arithmetic
        // regression in the constructor would pass the totalSupply-only test above.
        assertEq(b.balanceOf(treasury), airdropBeads * 1e18);
        assertEq(b.balanceOf(address(b)), (b.GENESIS_BEADS() - airdropBeads) * 1e18);
        assertEq(b.totalSupply(), b.GENESIS_BEADS() * 1e18);
    }

    event GenesisAllocated(address indexed treasury, uint256 airdropAmount, uint256 claimAmount);

    function test_constructor_emitsGenesisAllocatedArgs() public {
        uint256 genesisBeads = beadz.GENESIS_BEADS(); // hoisted: see prank-scoping note above
        vm.expectEmit(true, false, false, true);
        emit GenesisAllocated(treasury, 1_000 * 1e18, (genesisBeads - 1_000) * 1e18);
        new Beadz(keeper, treasury, 1_000);
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
        // Independent, hand-derived expectation (not recomputed from the contract's own
        // formula) so this test can actually catch an operator-ordering bug inside
        // collateralizationBps(), e.g. attested/outstanding*10000 would wrongly floor to 0.
        // 40_000 * 10_000 / 47_318 = 8453 (floor)
        assertEq(beadz.collateralizationBps(), 8453);
    }

    function test_collateralizationBps_emptySupplyReturnsMax() public {
        Beadz b = _allToTreasury();
        uint256 totalSupply = b.totalSupply(); // hoisted: see prank-scoping note above
        vm.prank(treasury);
        b.redeem(totalSupply, "empty-out");
        assertEq(b.totalSupply(), 0);
        assertEq(b.collateralizationBps(), type(uint256).max);
    }

    function test_collateralizationBps_noOverflowOnHugeAttestation() public {
        // default setUp(): supply == GENESIS_BEADS, outstanding == 47_318.
        vm.prank(keeper);
        beadz.attestBeadCount(type(uint256).max);
        // Independently computed expectation (via OZ Math.mulDiv, not the contract's own
        // formula) so this test actually proves the huge-attestation path no longer reverts
        // AND produces the mathematically correct floor(a*b/d), not just "didn't revert".
        uint256 expected = Math.mulDiv(type(uint256).max, 10_000, 47_318);
        assertEq(beadz.collateralizationBps(), expected);
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

    event ReserveRecordAttested(bytes32 indexed merkleRoot, string uri, uint256 timestamp);

    // --- attestReserveRecord ---

    function test_attestReserveRecord_emitsEvent() public {
        bytes32 root = keccak256("annual-report-2026");
        vm.expectEmit(true, false, false, true);
        emit ReserveRecordAttested(root, "ipfs://beadz-annual-2026", block.timestamp);
        vm.prank(keeper);
        beadz.attestReserveRecord(root, "ipfs://beadz-annual-2026");
    }

    function test_attestReserveRecord_onlyKeeper() public {
        vm.prank(alice);
        vm.expectRevert("BEADZ: caller is not the Vault Keeper");
        beadz.attestReserveRecord(bytes32(0), "x");
    }

    function test_attestReserveRecord_changesNoState() public {
        uint256 supplyBefore = beadz.totalSupply();
        uint256 attestedBefore = beadz.attestedBeads();
        uint256 deadlineBefore = beadz.redemptionDeadline();
        vm.prank(keeper);
        beadz.attestReserveRecord(keccak256("r"), "u");
        assertEq(beadz.totalSupply(), supplyBefore);
        assertEq(beadz.attestedBeads(), attestedBefore);
        assertEq(beadz.redemptionDeadline(), deadlineBefore);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title  BEADZ — The Bead Reserve
 * @notice A fixed-supply novelty token, fully and physically collateralized by a jar of
 *         glass seed beads held in the Fault and observed by camera. One (1) BEADZ is
 *         entitled to one (1) bead.
 *
 *         This is a collectible for amusement. It is NOT a stablecoin, a security, a deposit,
 *         or a payment instrument, and it is not pegged to any national currency. It carries
 *         no monetary value and no expectation of profit.
 *
 * @dev    Design guarantees (all enforced by the code below, not by trust):
 *          - Supply is minted exactly once, in the constructor. There is NO other mint path
 *            anywhere in this contract, so total supply can only ever DECREASE (via redemption).
 *            "Renouncing the mint" is achieved structurally: the ability simply does not exist.
 *          - The Vault Keeper role is deliberately powerless over tokens. It can only log bead
 *            recounts and acknowledge shipments. It cannot mint, move, freeze, or seize anyone's
 *            balance. It is therefore safe to operate as a low-stakes hot key.
 *          - Redemption BURNS tokens, so outstanding BEADZ always equals the beads still owed —
 *            a one-way ratchet toward an empty jar.
 *          - Redemption is time-boxed and MAY LAPSE if the Keeper does not renew it — that lapse is
 *            an intended feature of the design, not a failure mode. What the Keeper can never do is
 *            narrow it: every action the Keeper may take only ever WIDENS access — extending an open
 *            window outward, or reopening a lapsed one, by at most ~1 year per action. The one
 *            guarantee is that a redemption right, once GRANTED (i.e. a currently-open window), can
 *            never be taken away from a holder able to exercise it: an open window can only lapse
 *            through the ordinary passage of time, never be shortened or revoked early by the Keeper.
 *          - There is NO admin override. A lost or compromised Keeper key cannot be recovered or
 *            forcibly reclaimed through the contract. Because the Keeper controls no value, the
 *            intended response to compromise is REDEPLOYMENT of a new canonical contract, not rescue.
 *
 *         Built intentionally thin on top of OpenZeppelin's audited ERC20. Compile, test the
 *         claim / redeem / attest paths, and run static analysis before deployment.
 */
contract Beadz is ERC20 {
    /// @notice Genesis supply, denominated in whole beads. Equal to the physical count in the Fault.
    uint256 public constant GENESIS_BEADS = 47_318;

    /// @notice Beads distributed per claim: one (1) whole bead.
    uint256 public constant CLAIM_AMOUNT = 1e18;

    /// @notice Minimum redemption lot (a "creation unit"). Redeeming below this is disallowed so
    ///         that the certified-mail ceremony is never rationally worth exercising.
    uint256 public constant MIN_REDEMPTION = 100e18;

    /// @notice Maximum time a single extension or reopen may add — roughly one year. Bounds each action
    ///         so the redemption obligation can only ever be renewed in modest, deliberate steps.
    uint256 public constant MAX_EXTENSION = 366 days;

    /// @notice Physical redemption is available while `block.timestamp <= redemptionDeadline`.
    ///         Set at genesis to one year out. The Vault Keeper may extend it (while open) or reopen it
    ///         (after it lapses), by at most MAX_EXTENSION per action, and may NEVER shorten an open window.
    uint256 public redemptionDeadline;

    /// @notice Narrow custodial role. May log recounts and acknowledge shipments; nothing else.
    address public vaultKeeper;

    /// @notice Holder of the discretionary genesis allocation, carved from the fixed supply for
    ///         hand-distribution (gifts/airdrops). Recommended: a cold wallet, not the deployer.
    address public treasury;

    /// @notice Most recent physically attested bead count (the webcam recount).
    uint256 public attestedBeads;

    /// @notice Timestamp of the most recent attestation.
    uint256 public lastAttestation;

    /// @notice One live claim per address at a time (surrender a whole bead to re-open).
    mapping(address => bool) public hasClaimed;

    uint256 private _claimCounter;

    event BeadClaimed(address indexed bearer, uint256 indexed beadNumber);
    event GenesisAllocated(address indexed treasury, uint256 airdropAmount, uint256 claimAmount);
    event BeadCountAttested(uint256 beads, uint256 outstanding, uint256 timestamp);
    event PhysicalBeadRedemptionRequested(address indexed bearer, uint256 beads, string shippingRef);
    event BeadsSurrendered(address indexed formerBearer, uint256 beads);
    event RedemptionAcknowledged(address indexed bearer, uint256 beads, string trackingNumber);
    event RedemptionWindowSet(uint256 previousDeadline, uint256 newDeadline, bool reopened);
    event VaultKeeperTransferred(address indexed previousKeeper, address indexed newKeeper);

    modifier onlyKeeper() {
        require(msg.sender == vaultKeeper, "BEADZ: caller is not the Vault Keeper");
        _;
    }

    /**
     * @param keeper        The initial Vault Keeper (recommended: a dedicated low-value hot wallet).
     * @param treasury_     Recipient of the discretionary airdrop allocation (recommended: a cold wallet).
     * @param airdropBeads  Whole beads placed in the treasury for hand-distribution. Carved FROM the
     *                      fixed genesis supply, not added to it; the remainder funds the open `claim()`
     *                      pile. Must be <= GENESIS_BEADS. Set to 0 for a pure open claim.
     * @dev   Mints the entire fixed supply once, split between the treasury and this contract. No
     *        further minting is possible after construction; the split changes neither total supply
     *        nor collateralization.
     */
    constructor(address keeper, address treasury_, uint256 airdropBeads) ERC20("Beadz", "BEADZ") {
        require(keeper != address(0), "BEADZ: keeper is the zero address");
        require(treasury_ != address(0), "BEADZ: treasury is the zero address");
        require(airdropBeads <= GENESIS_BEADS, "BEADZ: airdrop exceeds genesis supply");

        vaultKeeper = keeper;
        treasury = treasury_;
        attestedBeads = GENESIS_BEADS;
        lastAttestation = block.timestamp;
        redemptionDeadline = block.timestamp + 365 days; // redemption open for one year from genesis

        // The one and only mint, ever — split from the fixed supply, summing to exactly GENESIS_BEADS.
        uint256 airdropAmount = airdropBeads * 1e18;
        uint256 claimPile = GENESIS_BEADS * 1e18 - airdropAmount;
        if (airdropAmount > 0) _mint(treasury_, airdropAmount);   // discretionary reserve, yours to airdrop
        if (claimPile > 0) _mint(address(this), claimPile);       // open-claim genesis pile

        emit VaultKeeperTransferred(address(0), keeper);
        emit GenesisAllocated(treasury_, airdropAmount, claimPile);
        emit BeadCountAttested(GENESIS_BEADS, GENESIS_BEADS, block.timestamp);
        emit RedemptionWindowSet(0, redemptionDeadline, false);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Claim — distribution of the genesis mint
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Claim one bead from the genesis mint. One per address; the claimer pays gas.
     * @dev    Transfers pre-minted supply out of the contract. It does NOT mint, and it does not
     *         touch the physical reserve — only the entitlement moves. To gate the drop to a
     *         specific list instead, replace the `hasClaimed` guard with a Merkle-proof check
     *         against a published root.
     */
    function claim() external {
        require(!hasClaimed[msg.sender], "BEADZ: address already claimed");
        require(balanceOf(address(this)) >= CLAIM_AMOUNT, "BEADZ: genesis pile exhausted");

        hasClaimed[msg.sender] = true;
        uint256 beadNumber = ++_claimCounter;

        _transfer(address(this), msg.sender, CLAIM_AMOUNT);
        emit BeadClaimed(msg.sender, beadNumber);
    }

    /**
     * @notice Surrender BEADZ back to the open-claim pile for redistribution to others.
     * @dev    Returns the tokens to the contract (does NOT burn — supply and reserve are unchanged).
     *         Returning at least one whole bead (>= CLAIM_AMOUNT) re-enables the sender's own
     *         `claim()`, so a holder can give their bead back and claim again later. Surrendering
     *         less than a whole bead is treated as a donation to the pile only — it does NOT
     *         reopen the claim, which prevents draining the pile via claim() -> surrender(dust) ->
     *         claim() -> ... loops that would otherwise let one address hoover up the whole reserve.
     */
    function surrender(uint256 amount) external {
        require(amount > 0, "BEADZ: nothing to surrender");
        // Only a full-bead-or-more return reopens the door; dust below CLAIM_AMOUNT is a
        // one-way donation that cannot be used to re-trigger claim().
        if (amount >= CLAIM_AMOUNT) hasClaimed[msg.sender] = false;
        _transfer(msg.sender, address(this), amount);
        emit BeadsSurrendered(msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Redemption — the one-way ratchet
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Burn BEADZ to request physical beads, shipped prepaid certified mail with signature.
     * @param  amount      Amount to redeem, in wei (must be whole beads and >= MIN_REDEMPTION).
     * @param  shippingRef An OFF-CHAIN reference only (e.g., a prepaid-label ID or ticket number).
     *                     Never put a postal address on-chain; it is public and permanent.
     * @dev    Burns the tokens, reducing total supply so outstanding BEADZ tracks beads still owed.
     *         Reverts once the redemption window has closed (see `redemptionDeadline`).
     */
    function redeem(uint256 amount, string calldata shippingRef) external {
        require(block.timestamp <= redemptionDeadline, "BEADZ: redemption window closed");
        require(amount >= MIN_REDEMPTION, "BEADZ: below minimum redemption lot");
        require(amount % 1e18 == 0, "BEADZ: whole beads only");

        _burn(msg.sender, amount); // ratchet: supply can only shrink
        emit PhysicalBeadRedemptionRequested(msg.sender, amount / 1e18, shippingRef);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Vault Keeper — attestation and acknowledgement only
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Log a physical recount of the jar. Informational only; changes no balances.
    function attestBeadCount(uint256 beads) external onlyKeeper {
        attestedBeads = beads;
        lastAttestation = block.timestamp;
        emit BeadCountAttested(beads, totalSupply() / 1e18, block.timestamp);
    }

    /// @notice Record that a redemption was shipped, logging its tracking number.
    function acknowledgeRedemption(address bearer, uint256 beads, string calldata trackingNumber)
        external
        onlyKeeper
    {
        emit RedemptionAcknowledged(bearer, beads, trackingNumber);
    }

    /**
     * @notice Extend the open redemption window outward, or reopen it after it has lapsed.
     * @dev    This power can only ever WIDEN access to redemption; it can never remove it:
     *          - If the window is currently OPEN, `newDeadline` must be >= the current deadline
     *            (no shortening on live holders) and at most MAX_EXTENSION beyond it.
     *          - If the window has CLOSED, this reopens it: `newDeadline` may be up to MAX_EXTENSION
     *            from now. Reopening only adds rights, so it is safe.
     *         Both branches cap a single action to ~1 year, making renewal a deliberate, repeatable act.
     */
    function setRedemptionDeadline(uint256 newDeadline) external onlyKeeper {
        require(newDeadline > block.timestamp, "BEADZ: deadline must be in the future");
        uint256 prev = redemptionDeadline;

        if (block.timestamp <= prev) {
            // window open: outward-only, capped
            require(newDeadline >= prev, "BEADZ: cannot shorten an open window");
            require(newDeadline <= prev + MAX_EXTENSION, "BEADZ: at most one year per extension");
            redemptionDeadline = newDeadline;
            emit RedemptionWindowSet(prev, newDeadline, false);
        } else {
            // window lapsed: reopen, capped from now
            require(newDeadline <= block.timestamp + MAX_EXTENSION, "BEADZ: at most one year per reopen");
            redemptionDeadline = newDeadline;
            emit RedemptionWindowSet(prev, newDeadline, true);
        }
    }

    /// @notice Rotate the Keeper hot key. Set to address(0) to permanently freeze attestations.
    function transferVaultKeeper(address newKeeper) external onlyKeeper {
        emit VaultKeeperTransferred(vaultKeeper, newKeeper);
        vaultKeeper = newKeeper;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Views
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Beads still available to claim from the genesis pile.
    function unclaimedBeads() external view returns (uint256) {
        return balanceOf(address(this)) / 1e18;
    }

    /// @notice Whether physical redemption is currently open.
    function redemptionOpen() external view returns (bool) {
        return block.timestamp <= redemptionDeadline;
    }

    /// @notice Collateralization in basis points (10000 = 100.0%): attested beads vs outstanding BEADZ.
    function collateralizationBps() external view returns (uint256) {
        uint256 outstanding = totalSupply() / 1e18;
        if (outstanding == 0) return type(uint256).max; // an empty Fault is vacuously reserved
        return (attestedBeads * 10_000) / outstanding;
    }
}

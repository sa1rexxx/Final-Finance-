// SPDX-License-Identifier: MIT
// Educational project for the course Introduction to Finance.
// Not a real product, service or investment offer. Do not use with real funds.
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract LendLinkCore is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant LENDER_ROLE = keccak256("LENDER_ROLE");
    bytes32 public constant CONSENT_GATEWAY_ROLE = keccak256("CONSENT_GATEWAY_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    struct LoanRecord {
        address lender;
        uint8 amountBand;   // 1: <150k KZT, 2: 150k-500k KZT, 3: >500k KZT
        uint8 status;       // 0: Active, 1: Repaid, 2: Overdue30Plus, 3: Disputed
        uint64 createdAt;
    }

    struct BorrowerAggregates {
        uint256 activeCount;
        uint256 totalDebtScore;
        uint256 disputedCount;
    }

    mapping(bytes32 => mapping(address => uint256)) public consentExpiry;
    mapping(bytes32 => LoanRecord[]) private borrowerLoans;
    mapping(bytes32 => BorrowerAggregates) private borrowerSummary;

    event ConsentGranted(bytes32 indexed pseudonymId, address indexed lender, uint256 expiry);
    event ConsentRevoked(bytes32 indexed pseudonymId, address indexed lender);
    event CreditChecked(bytes32 indexed pseudonymId, address indexed lender, uint256 timestamp);
    event LoanRecorded(bytes32 indexed pseudonymId, address indexed lender, uint256 loanIndex);
    event LoanStatusUpdated(bytes32 indexed pseudonymId, uint256 indexed loanIndex, uint8 newStatus);

    constructor(address multisigAdmin, address gateway) {
        _grantRole(DEFAULT_ADMIN_ROLE, multisigAdmin);
        _grantRole(CONSENT_GATEWAY_ROLE, gateway);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function grantConsent(bytes32 pseudonymId, address lender, uint256 ttlSeconds)
        external onlyRole(CONSENT_GATEWAY_ROLE) whenNotPaused
    {
        require(hasRole(LENDER_ROLE, lender), "Unregistered lender");
        uint256 expiry = block.timestamp + ttlSeconds;
        consentExpiry[pseudonymId][lender] = expiry;
        emit ConsentGranted(pseudonymId, lender, expiry);
    }

    function revokeConsent(bytes32 pseudonymId, address lender)
        external onlyRole(CONSENT_GATEWAY_ROLE)
    {
        consentExpiry[pseudonymId][lender] = 0;
        emit ConsentRevoked(pseudonymId, lender);
    }

    function checkCreditSummary(bytes32 pseudonymId)
        external onlyRole(LENDER_ROLE) whenNotPaused nonReentrant
        returns (uint256 activeCount, uint256 debtScore, uint256 disputedCount)
    {
        require(block.timestamp < consentExpiry[pseudonymId][msg.sender], "ConsentMissingOrExpired");
        emit CreditChecked(pseudonymId, msg.sender, block.timestamp);
        BorrowerAggregates storage agg = borrowerSummary[pseudonymId];
        return (agg.activeCount, agg.totalDebtScore, agg.disputedCount);
    }

    function recordLoan(bytes32 pseudonymId, uint8 amountBand)
        external onlyRole(LENDER_ROLE) whenNotPaused nonReentrant
    {
        require(block.timestamp < consentExpiry[pseudonymId][msg.sender], "ConsentMissingOrExpired");
        require(amountBand >= 1 && amountBand <= 3, "Invalid band");
        borrowerLoans[pseudonymId].push(LoanRecord(msg.sender, amountBand, 0, uint64(block.timestamp)));
        borrowerSummary[pseudonymId].activeCount += 1;
        borrowerSummary[pseudonymId].totalDebtScore += amountBand;
        emit LoanRecorded(pseudonymId, msg.sender, borrowerLoans[pseudonymId].length - 1);
    }

    function updateLoanStatus(bytes32 pseudonymId, uint256 loanIndex, uint8 newStatus)
        external onlyRole(LENDER_ROLE) whenNotPaused
    {
        LoanRecord storage rec = borrowerLoans[pseudonymId][loanIndex];
        require(rec.lender == msg.sender, "Not loan originator");
        if (rec.status == 0 && newStatus == 1) {
            borrowerSummary[pseudonymId].activeCount -= 1;
            borrowerSummary[pseudonymId].totalDebtScore -= rec.amountBand;
        }
        rec.status = newStatus;
        emit LoanStatusUpdated(pseudonymId, loanIndex, newStatus);
    }

    function openDispute(bytes32 pseudonymId, uint256 loanIndex)
        external whenNotPaused
    {
        require(hasRole(LENDER_ROLE, msg.sender) || hasRole(AUDITOR_ROLE, msg.sender), "Unauthorized");
        LoanRecord storage rec = borrowerLoans[pseudonymId][loanIndex];
        require(rec.status != 3, "Already disputed");
        rec.status = 3;
        borrowerSummary[pseudonymId].disputedCount += 1;
        emit LoanStatusUpdated(pseudonymId, loanIndex, 3);
    }
}

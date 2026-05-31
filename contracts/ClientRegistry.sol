// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ClientRegistry is Ownable {
    uint256 private constant USDC_SCALE = 1e6;
    uint256 private constant PAID_CAP = 10_000 * USDC_SCALE;
    uint256 private constant SLASHED_BOND_CAP = 10_000 * USDC_SCALE;

    struct ClientStats {
        uint256 jobsCreated;
        uint256 jobsApproved;
        uint256 jobsRejected;
        uint256 disputesLost;
        uint256 disputesWon;
        uint256 totalPaid;
        uint256 totalRefunded;
        uint256 totalBondSlashed;
    }

    mapping(address => ClientStats) private stats;
    mapping(address => bool) public authorizedUpdaters;

    event ClientStatsUpdated(address indexed client);
    event AuthorizedUpdaterSet(address indexed updater, bool allowed);

    modifier onlyAuthorizedUpdater() {
        require(authorizedUpdaters[msg.sender], "ClientRegistry: not authorized");
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setAuthorizedUpdater(address updater, bool allowed) external onlyOwner {
        require(updater != address(0), "ClientRegistry: zero updater");
        authorizedUpdaters[updater] = allowed;
        emit AuthorizedUpdaterSet(updater, allowed);
    }

    function recordJobCreated(address client, uint256 amount) external onlyAuthorizedUpdater {
        _requireClient(client);
        ClientStats storage clientStats = stats[client];
        clientStats.jobsCreated += 1;
        clientStats.totalPaid += amount;
        emit ClientStatsUpdated(client);
    }

    function recordJobApproved(address client, uint256 amount) external onlyAuthorizedUpdater {
        _requireClient(client);
        ClientStats storage clientStats = stats[client];
        clientStats.jobsApproved += 1;
        clientStats.totalPaid += amount;
        emit ClientStatsUpdated(client);
    }

    function recordJobRejected(address client, uint256 amount) external onlyAuthorizedUpdater {
        _requireClient(client);
        ClientStats storage clientStats = stats[client];
        clientStats.jobsRejected += 1;
        clientStats.totalRefunded += amount;
        emit ClientStatsUpdated(client);
    }

    function recordDisputeWon(address client) external onlyAuthorizedUpdater {
        _requireClient(client);
        stats[client].disputesWon += 1;
        emit ClientStatsUpdated(client);
    }

    function recordDisputeLost(address client, uint256 slashedBond) external onlyAuthorizedUpdater {
        _requireClient(client);
        ClientStats storage clientStats = stats[client];
        clientStats.disputesLost += 1;
        clientStats.totalBondSlashed += slashedBond;
        emit ClientStatsUpdated(client);
    }

    function getClientStats(address client) external view returns (ClientStats memory) {
        return stats[client];
    }

    function getClientScore(address client) external view returns (uint256) {
        ClientStats memory clientStats = stats[client];

        // Simple deterministic 0-1000 score: baseline plus bounded approval/payment/dispute-win
        // bonuses, minus bounded penalties for lost disputes, rejections, and slashed bond.
        int256 score = 700;
        uint256 approvedBonus = _min(clientStats.jobsApproved * 5, 100);
        uint256 paidBonus = (_min(clientStats.totalPaid, PAID_CAP) * 100) / PAID_CAP;
        uint256 disputeWinBonus = _min(clientStats.disputesWon * 10, 50);
        uint256 disputeLostPenalty = _min(clientStats.disputesLost * 50, 250);
        uint256 rejectionPenalty = _min(clientStats.jobsRejected * 15, 100);
        uint256 bondPenalty = (_min(clientStats.totalBondSlashed, SLASHED_BOND_CAP) * 50) / SLASHED_BOND_CAP;

        score += int256(approvedBonus + paidBonus + disputeWinBonus);
        score -= int256(disputeLostPenalty + rejectionPenalty + bondPenalty);

        if (score < 0) {
            return 0;
        }
        if (score > 1000) {
            return 1000;
        }
        return uint256(score);
    }

    function _requireClient(address client) private pure {
        require(client != address(0), "ClientRegistry: zero client");
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}

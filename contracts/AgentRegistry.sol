// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract AgentRegistry is Ownable {
    uint256 private constant USDC_SCALE = 1e6;
    uint256 private constant EARNINGS_CAP = 10_000 * USDC_SCALE;
    uint256 private constant SLASH_CAP = 10_000 * USDC_SCALE;

    struct AgentProfile {
        uint256 agentId;
        address owner;
        string name;
        string category;
        string metadataURI;
        bytes32 skillsHash;
        address operatingWallet;
        address reserveWallet;
        bool active;
        uint64 createdAt;
    }

    struct AgentStats {
        uint256 completedJobs;
        uint256 failedJobs;
        uint256 disputedJobs;
        uint256 lifetimeEarned;
        uint256 totalEscrowed;
        uint256 totalSlashed;
        uint256 totalToolSpend;
        uint64 lastActiveAt;
    }

    uint256 public nextAgentId = 1;
    mapping(uint256 => AgentProfile) private agents;
    mapping(uint256 => AgentStats) private stats;
    mapping(address => bool) public authorizedUpdaters;

    event AgentRegistered(
        uint256 indexed agentId,
        address indexed owner,
        string name,
        string category,
        address operatingWallet,
        address reserveWallet
    );
    event AgentUpdated(uint256 indexed agentId, string metadataURI, bytes32 skillsHash, address operatingWallet, address reserveWallet);
    event AgentDeactivated(uint256 indexed agentId);
    event AgentStatsUpdated(uint256 indexed agentId);
    event AuthorizedUpdaterSet(address indexed updater, bool allowed);

    modifier onlyAgentOwner(uint256 agentId) {
        _requireAgentExists(agentId);
        require(agents[agentId].owner == msg.sender, "AgentRegistry: not agent owner");
        _;
    }

    modifier onlyAuthorizedUpdater() {
        require(authorizedUpdaters[msg.sender], "AgentRegistry: not authorized");
        _;
    }

    constructor() Ownable(msg.sender) {}

    function registerAgent(
        string calldata name,
        string calldata category,
        string calldata metadataURI,
        bytes32 skillsHash,
        address operatingWallet,
        address reserveWallet
    ) external returns (uint256) {
        require(bytes(name).length != 0, "AgentRegistry: empty name");
        require(msg.sender != address(0), "AgentRegistry: zero owner");
        require(operatingWallet != address(0), "AgentRegistry: zero operating wallet");
        require(reserveWallet != address(0), "AgentRegistry: zero reserve wallet");

        uint256 agentId = nextAgentId++;
        agents[agentId] = AgentProfile({
            agentId: agentId,
            owner: msg.sender,
            name: name,
            category: category,
            metadataURI: metadataURI,
            skillsHash: skillsHash,
            operatingWallet: operatingWallet,
            reserveWallet: reserveWallet,
            active: true,
            createdAt: uint64(block.timestamp)
        });

        emit AgentRegistered(agentId, msg.sender, name, category, operatingWallet, reserveWallet);
        return agentId;
    }

    function updateAgent(
        uint256 agentId,
        string calldata metadataURI,
        bytes32 skillsHash,
        address operatingWallet,
        address reserveWallet
    ) external onlyAgentOwner(agentId) {
        require(operatingWallet != address(0), "AgentRegistry: zero operating wallet");
        require(reserveWallet != address(0), "AgentRegistry: zero reserve wallet");

        AgentProfile storage agent = agents[agentId];
        agent.metadataURI = metadataURI;
        agent.skillsHash = skillsHash;
        agent.operatingWallet = operatingWallet;
        agent.reserveWallet = reserveWallet;

        emit AgentUpdated(agentId, metadataURI, skillsHash, operatingWallet, reserveWallet);
    }

    function deactivateAgent(uint256 agentId) external onlyAgentOwner(agentId) {
        agents[agentId].active = false;
        emit AgentDeactivated(agentId);
    }

    function setAuthorizedUpdater(address updater, bool allowed) external onlyOwner {
        require(updater != address(0), "AgentRegistry: zero updater");
        authorizedUpdaters[updater] = allowed;
        emit AuthorizedUpdaterSet(updater, allowed);
    }

    function recordJobCreated(uint256 agentId, uint256 amount) external onlyAuthorizedUpdater {
        _requireAgentExists(agentId);
        AgentStats storage agentStats = stats[agentId];
        agentStats.totalEscrowed += amount;
        agentStats.lastActiveAt = uint64(block.timestamp);
        emit AgentStatsUpdated(agentId);
    }

    function recordJobCompleted(uint256 agentId, uint256 earnedAmount) external onlyAuthorizedUpdater {
        _requireAgentExists(agentId);
        AgentStats storage agentStats = stats[agentId];
        agentStats.completedJobs += 1;
        agentStats.lifetimeEarned += earnedAmount;
        agentStats.lastActiveAt = uint64(block.timestamp);
        emit AgentStatsUpdated(agentId);
    }

    function recordJobFailed(uint256 agentId, uint256 slashedAmount) external onlyAuthorizedUpdater {
        _requireAgentExists(agentId);
        AgentStats storage agentStats = stats[agentId];
        agentStats.failedJobs += 1;
        agentStats.totalSlashed += slashedAmount;
        agentStats.lastActiveAt = uint64(block.timestamp);
        emit AgentStatsUpdated(agentId);
    }

    function recordDispute(uint256 agentId) external onlyAuthorizedUpdater {
        _requireAgentExists(agentId);
        AgentStats storage agentStats = stats[agentId];
        agentStats.disputedJobs += 1;
        agentStats.lastActiveAt = uint64(block.timestamp);
        emit AgentStatsUpdated(agentId);
    }

    function recordToolSpend(uint256 agentId, uint256 amount) external onlyAuthorizedUpdater {
        _requireAgentExists(agentId);
        AgentStats storage agentStats = stats[agentId];
        agentStats.totalToolSpend += amount;
        agentStats.lastActiveAt = uint64(block.timestamp);
        emit AgentStatsUpdated(agentId);
    }

    function getAgent(uint256 agentId) external view returns (AgentProfile memory) {
        _requireAgentExists(agentId);
        return agents[agentId];
    }

    function getStats(uint256 agentId) external view returns (AgentStats memory) {
        _requireAgentExists(agentId);
        return stats[agentId];
    }

    function ownerOfAgent(uint256 agentId) external view returns (address) {
        _requireAgentExists(agentId);
        return agents[agentId].owner;
    }

    function isActiveAgent(uint256 agentId) external view returns (bool) {
        _requireAgentExists(agentId);
        return agents[agentId].active;
    }

    function getReputationScore(uint256 agentId) external view returns (uint256) {
        _requireAgentExists(agentId);
        AgentStats memory agentStats = stats[agentId];

        // Simple deterministic 0-1000 score: baseline plus bounded job/earnings/activity bonuses,
        // minus bounded penalties for failures, disputes, and slashed bond.
        int256 score = 500;
        uint256 completedBonus = _min(agentStats.completedJobs, 50) * 4;
        uint256 earningsBonus = (_min(agentStats.lifetimeEarned, EARNINGS_CAP) * 150) / EARNINGS_CAP;
        uint256 failurePenalty = _min((agentStats.failedJobs + agentStats.disputedJobs) * 25, 250);
        uint256 slashPenalty = (_min(agentStats.totalSlashed, SLASH_CAP) * 150) / SLASH_CAP;

        score += int256(completedBonus);
        score += int256(earningsBonus);
        if (agentStats.lastActiveAt != 0) {
            score += 50;
        }
        score -= int256(failurePenalty);
        score -= int256(slashPenalty);

        if (score < 0) {
            return 0;
        }
        if (score > 1000) {
            return 1000;
        }
        return uint256(score);
    }

    function _requireAgentExists(uint256 agentId) internal view {
        require(agents[agentId].owner != address(0), "AgentRegistry: nonexistent agent");
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}

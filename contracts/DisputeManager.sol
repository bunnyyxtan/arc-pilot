// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AgentRegistry} from "./AgentRegistry.sol";
import {ClientRegistry} from "./ClientRegistry.sol";
import {TrustBondVault} from "./TrustBondVault.sol";
import {AgentJobEscrow} from "./AgentJobEscrow.sol";

contract DisputeManager is Ownable {
    AgentJobEscrow public immutable escrow;
    AgentRegistry public immutable agentRegistry;
    ClientRegistry public immutable clientRegistry;
    TrustBondVault public immutable trustBondVault;
    uint256 public nextDisputeId = 1;
    mapping(uint256 => Dispute) private disputes;
    mapping(uint256 => uint256) public jobToDispute;
    mapping(address => bool) public resolvers;

    enum Outcome {
        None,
        AgentWins,
        ClientWins,
        Split
    }

    struct Dispute {
        uint256 disputeId;
        uint256 jobId;
        address openedBy;
        string reasonURI;
        string evidenceURI;
        Outcome outcome;
        bool resolved;
        uint64 createdAt;
        uint64 resolvedAt;
    }

    event ResolverSet(address indexed resolver, bool allowed);
    event DisputeOpened(uint256 indexed disputeId, uint256 indexed jobId, address indexed openedBy, string reasonURI);
    event EvidenceSubmitted(uint256 indexed disputeId, string evidenceURI);
    event DisputeResolved(uint256 indexed disputeId, uint256 indexed jobId, Outcome outcome);

    modifier onlyEscrow() {
        require(msg.sender == address(escrow), "DisputeManager: not escrow");
        _;
    }

    modifier onlyResolverOrOwner() {
        require(resolvers[msg.sender] || msg.sender == owner(), "DisputeManager: not resolver");
        _;
    }

    constructor(address escrow_, address agentRegistry_, address clientRegistry_, address trustBondVault_) Ownable(msg.sender) {
        require(escrow_ != address(0), "DisputeManager: zero escrow");
        require(agentRegistry_ != address(0), "DisputeManager: zero agent registry");
        require(clientRegistry_ != address(0), "DisputeManager: zero client registry");
        require(trustBondVault_ != address(0), "DisputeManager: zero bond vault");

        escrow = AgentJobEscrow(escrow_);
        agentRegistry = AgentRegistry(agentRegistry_);
        clientRegistry = ClientRegistry(clientRegistry_);
        trustBondVault = TrustBondVault(trustBondVault_);
    }

    function setResolver(address resolver, bool allowed) external onlyOwner {
        require(resolver != address(0), "DisputeManager: zero resolver");
        resolvers[resolver] = allowed;
        emit ResolverSet(resolver, allowed);
    }

    function openDispute(uint256 jobId, address openedBy, string calldata reasonURI) external onlyEscrow returns (uint256) {
        require(jobToDispute[jobId] == 0, "DisputeManager: dispute exists");
        require(openedBy != address(0), "DisputeManager: zero opener");

        uint256 disputeId = nextDisputeId++;
        disputes[disputeId] = Dispute({
            disputeId: disputeId,
            jobId: jobId,
            openedBy: openedBy,
            reasonURI: reasonURI,
            evidenceURI: "",
            outcome: Outcome.None,
            resolved: false,
            createdAt: uint64(block.timestamp),
            resolvedAt: 0
        });
        jobToDispute[jobId] = disputeId;

        emit DisputeOpened(disputeId, jobId, openedBy, reasonURI);
        return disputeId;
    }

    function submitEvidence(uint256 disputeId, string calldata evidenceURI) external {
        Dispute storage dispute = _getDisputeStorage(disputeId);
        require(!dispute.resolved, "DisputeManager: resolved");

        AgentJobEscrow.Job memory job = escrow.getJob(dispute.jobId);
        require(
            msg.sender == dispute.openedBy ||
                msg.sender == job.client ||
                msg.sender == job.evaluator ||
                msg.sender == agentRegistry.ownerOfAgent(job.agentId),
            "DisputeManager: not participant"
        );

        dispute.evidenceURI = evidenceURI;
        emit EvidenceSubmitted(disputeId, evidenceURI);
    }

    function resolveAgentWins(uint256 disputeId) external onlyResolverOrOwner {
        Dispute storage dispute = _getUnresolvedDispute(disputeId);
        dispute.outcome = Outcome.AgentWins;
        _markResolved(dispute);

        escrow.releaseAfterDispute(dispute.jobId);
        AgentJobEscrow.Job memory job = escrow.getJob(dispute.jobId);
        clientRegistry.recordDisputeLost(job.client, 0);

        emit DisputeResolved(disputeId, dispute.jobId, Outcome.AgentWins);
    }

    function resolveClientWins(uint256 disputeId, uint256 slashAmount) external onlyResolverOrOwner {
        Dispute storage dispute = _getUnresolvedDispute(disputeId);
        dispute.outcome = Outcome.ClientWins;
        _markResolved(dispute);

        escrow.refundAfterDispute(dispute.jobId, slashAmount);
        AgentJobEscrow.Job memory job = escrow.getJob(dispute.jobId);
        clientRegistry.recordDisputeWon(job.client);

        emit DisputeResolved(disputeId, dispute.jobId, Outcome.ClientWins);
    }

    function resolveSplit(uint256 disputeId, uint256 agentBps, uint256 clientBps) external onlyResolverOrOwner {
        require(agentBps + clientBps == 10_000, "DisputeManager: bps must equal 10000");
        Dispute storage dispute = _getUnresolvedDispute(disputeId);
        dispute.outcome = Outcome.Split;
        _markResolved(dispute);

        escrow.splitAfterDispute(dispute.jobId, agentBps, clientBps);

        emit DisputeResolved(disputeId, dispute.jobId, Outcome.Split);
    }

    function getDispute(uint256 disputeId) external view returns (Dispute memory) {
        Dispute storage dispute = _getDisputeStorage(disputeId);
        return dispute;
    }

    function _getUnresolvedDispute(uint256 disputeId) private view returns (Dispute storage dispute) {
        dispute = _getDisputeStorage(disputeId);
        require(!dispute.resolved, "DisputeManager: already resolved");
    }

    function _getDisputeStorage(uint256 disputeId) private view returns (Dispute storage dispute) {
        dispute = disputes[disputeId];
        require(dispute.createdAt != 0, "DisputeManager: nonexistent dispute");
    }

    function _markResolved(Dispute storage dispute) private {
        dispute.resolved = true;
        dispute.resolvedAt = uint64(block.timestamp);
    }
}

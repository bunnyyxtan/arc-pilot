// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AgentRegistry} from "./AgentRegistry.sol";
import {ClientRegistry} from "./ClientRegistry.sol";
import {TrustBondVault} from "./TrustBondVault.sol";

interface IDisputeManager {
    function openDispute(uint256 jobId, address openedBy, string calldata reasonURI) external returns (uint256);
}

contract AgentJobEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    AgentRegistry public immutable agentRegistry;
    ClientRegistry public immutable clientRegistry;
    TrustBondVault public immutable trustBondVault;
    address public disputeManager;
    uint256 public nextJobId = 1;

    enum Status {
        Open,
        Funded,
        Running,
        Submitted,
        Completed,
        Rejected,
        Disputed,
        Expired,
        Refunded
    }

    struct Job {
        uint256 jobId;
        uint256 agentId;
        address client;
        address evaluator;
        uint256 amount;
        uint256 clientBond;
        uint64 deadline;
        string jobURI;
        string deliverableURI;
        Status status;
        uint64 createdAt;
        uint64 fundedAt;
        uint64 runningAt;
        uint64 submittedAt;
        uint64 resolvedAt;
    }

    struct TreasuryPolicy {
        uint256 operatingBps;
        uint256 reserveBps;
        uint256 bondBps;
    }

    mapping(uint256 => Job) private jobs;
    mapping(uint256 => TreasuryPolicy) private treasuryPolicies;

    event JobCreated(
        uint256 indexed jobId,
        uint256 indexed agentId,
        address indexed client,
        address evaluator,
        uint256 amount,
        uint256 clientBond,
        uint64 deadline,
        string jobURI
    );
    event JobFunded(uint256 indexed jobId, uint256 amount, uint256 clientBond);
    event JobRunning(uint256 indexed jobId);
    event DeliverableSubmitted(uint256 indexed jobId, string deliverableURI);
    event JobCompleted(uint256 indexed jobId);
    event JobMovedToDispute(uint256 indexed jobId, uint256 indexed disputeId, string reasonURI);
    event JobExpired(uint256 indexed jobId);
    event JobRefunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event TreasuryPolicyUpdated(uint256 indexed agentId, uint256 operatingBps, uint256 reserveBps, uint256 bondBps);
    event PaymentSplit(uint256 indexed jobId, uint256 operatingAmount, uint256 reserveAmount, uint256 bondAmount);
    event DisputeManagerSet(address indexed disputeManager);

    modifier onlyDisputeManager() {
        require(msg.sender == disputeManager, "AgentJobEscrow: not dispute manager");
        _;
    }

    modifier onlyAgentOwner(uint256 agentId) {
        require(agentRegistry.ownerOfAgent(agentId) == msg.sender, "AgentJobEscrow: not agent owner");
        _;
    }

    constructor(
        address usdc_,
        address agentRegistry_,
        address clientRegistry_,
        address trustBondVault_
    ) Ownable(msg.sender) {
        require(usdc_ != address(0), "AgentJobEscrow: zero usdc");
        require(agentRegistry_ != address(0), "AgentJobEscrow: zero agent registry");
        require(clientRegistry_ != address(0), "AgentJobEscrow: zero client registry");
        require(trustBondVault_ != address(0), "AgentJobEscrow: zero bond vault");

        usdc = IERC20(usdc_);
        agentRegistry = AgentRegistry(agentRegistry_);
        clientRegistry = ClientRegistry(clientRegistry_);
        trustBondVault = TrustBondVault(trustBondVault_);
    }

    function setDisputeManager(address disputeManager_) external onlyOwner {
        require(disputeManager_ != address(0), "AgentJobEscrow: zero dispute manager");
        disputeManager = disputeManager_;
        emit DisputeManagerSet(disputeManager_);
    }

    function setTreasuryPolicy(uint256 agentId, uint256 operatingBps, uint256 reserveBps, uint256 bondBps) external {
        require(agentRegistry.ownerOfAgent(agentId) == msg.sender || msg.sender == owner(), "AgentJobEscrow: not authorized");
        require(operatingBps + reserveBps + bondBps == 10_000, "AgentJobEscrow: bps must equal 10000");

        treasuryPolicies[agentId] = TreasuryPolicy({
            operatingBps: operatingBps,
            reserveBps: reserveBps,
            bondBps: bondBps
        });
        emit TreasuryPolicyUpdated(agentId, operatingBps, reserveBps, bondBps);
    }

    function getTreasuryPolicy(uint256 agentId) public view returns (TreasuryPolicy memory) {
        TreasuryPolicy memory policy = treasuryPolicies[agentId];
        if (policy.operatingBps + policy.reserveBps + policy.bondBps == 0) {
            return TreasuryPolicy({operatingBps: 8000, reserveBps: 1000, bondBps: 1000});
        }
        return policy;
    }

    function createJob(
        uint256 agentId,
        address evaluator,
        uint256 amount,
        uint256 clientBond,
        uint64 deadline,
        string calldata jobURI
    ) external returns (uint256) {
        require(agentRegistry.isActiveAgent(agentId), "AgentJobEscrow: inactive agent");
        require(amount > 0, "AgentJobEscrow: zero amount");
        require(deadline > block.timestamp, "AgentJobEscrow: invalid deadline");

        uint256 jobId = nextJobId++;
        address finalEvaluator = evaluator == address(0) ? msg.sender : evaluator;
        jobs[jobId] = Job({
            jobId: jobId,
            agentId: agentId,
            client: msg.sender,
            evaluator: finalEvaluator,
            amount: amount,
            clientBond: clientBond,
            deadline: deadline,
            jobURI: jobURI,
            deliverableURI: "",
            status: Status.Open,
            createdAt: uint64(block.timestamp),
            fundedAt: 0,
            runningAt: 0,
            submittedAt: 0,
            resolvedAt: 0
        });

        agentRegistry.recordJobCreated(agentId, amount);
        clientRegistry.recordJobCreated(msg.sender, amount);

        emit JobCreated(jobId, agentId, msg.sender, finalEvaluator, amount, clientBond, deadline, jobURI);
        return jobId;
    }

    function fundJob(uint256 jobId) external nonReentrant {
        Job storage job = _getJobStorage(jobId);
        require(job.status == Status.Open, "AgentJobEscrow: not open");
        require(msg.sender == job.client, "AgentJobEscrow: not client");

        job.status = Status.Funded;
        job.fundedAt = uint64(block.timestamp);
        usdc.safeTransferFrom(msg.sender, address(this), job.amount + job.clientBond);

        emit JobFunded(jobId, job.amount, job.clientBond);
    }

    function markRunning(uint256 jobId) external onlyAgentOwner(_getJobStorage(jobId).agentId) {
        Job storage job = _getJobStorage(jobId);
        require(job.status == Status.Funded, "AgentJobEscrow: not funded");
        require(block.timestamp <= job.deadline, "AgentJobEscrow: deadline passed");

        job.status = Status.Running;
        job.runningAt = uint64(block.timestamp);
        emit JobRunning(jobId);
    }

    function submitDeliverable(uint256 jobId, string calldata deliverableURI)
        external
        onlyAgentOwner(_getJobStorage(jobId).agentId)
    {
        Job storage job = _getJobStorage(jobId);
        require(job.status == Status.Running, "AgentJobEscrow: not running");
        require(bytes(deliverableURI).length != 0, "AgentJobEscrow: empty deliverable");
        require(block.timestamp <= job.deadline, "AgentJobEscrow: deadline passed");

        job.status = Status.Submitted;
        job.deliverableURI = deliverableURI;
        job.submittedAt = uint64(block.timestamp);
        emit DeliverableSubmitted(jobId, deliverableURI);
    }

    function approveAndRelease(uint256 jobId) external nonReentrant {
        Job storage job = _getJobStorage(jobId);
        _requireEvaluatorOrClient(job);
        require(job.status == Status.Submitted, "AgentJobEscrow: not submitted");

        job.status = Status.Completed;
        job.resolvedAt = uint64(block.timestamp);
        _releaseTreasury(jobId, job.agentId, job.amount);
        _returnClientBond(job);

        agentRegistry.recordJobCompleted(job.agentId, job.amount);
        clientRegistry.recordJobApproved(job.client, job.amount);

        emit JobCompleted(jobId);
    }

    function rejectToDispute(uint256 jobId, string calldata reasonURI) external {
        Job storage job = _getJobStorage(jobId);
        _requireEvaluatorOrClient(job);
        require(job.status == Status.Submitted, "AgentJobEscrow: not submitted");
        require(disputeManager != address(0), "AgentJobEscrow: dispute manager unset");

        job.status = Status.Disputed;
        agentRegistry.recordDispute(job.agentId);
        clientRegistry.recordJobRejected(job.client, job.amount);

        uint256 disputeId = IDisputeManager(disputeManager).openDispute(jobId, msg.sender, reasonURI);
        emit JobMovedToDispute(jobId, disputeId, reasonURI);
    }

    function expireAndRefund(uint256 jobId) external nonReentrant {
        Job storage job = _getJobStorage(jobId);
        require(block.timestamp > job.deadline, "AgentJobEscrow: deadline active");
        require(
            job.status == Status.Open || job.status == Status.Funded || job.status == Status.Running,
            "AgentJobEscrow: cannot expire"
        );

        uint256 refundAmount = _escrowedBalance(job);
        job.status = job.fundedAt == 0 ? Status.Expired : Status.Refunded;
        job.resolvedAt = uint64(block.timestamp);

        if (refundAmount > 0) {
            usdc.safeTransfer(job.client, refundAmount);
            clientRegistry.recordJobRejected(job.client, job.amount);
            emit JobRefunded(jobId, job.client, refundAmount);
        }
        agentRegistry.recordJobFailed(job.agentId, 0);
        emit JobExpired(jobId);
    }

    function releaseAfterDispute(uint256 jobId) external nonReentrant onlyDisputeManager {
        Job storage job = _getJobStorage(jobId);
        require(job.status == Status.Disputed, "AgentJobEscrow: not disputed");

        job.status = Status.Completed;
        job.resolvedAt = uint64(block.timestamp);
        _releaseTreasury(jobId, job.agentId, job.amount);
        _payClientBondToAgent(job);
        agentRegistry.recordJobCompleted(job.agentId, job.amount);

        emit JobCompleted(jobId);
    }

    function refundAfterDispute(uint256 jobId, uint256 slashAmount) external nonReentrant onlyDisputeManager {
        Job storage job = _getJobStorage(jobId);
        require(job.status == Status.Disputed, "AgentJobEscrow: not disputed");

        job.status = Status.Refunded;
        job.resolvedAt = uint64(block.timestamp);
        uint256 refundAmount = job.amount + job.clientBond;
        usdc.safeTransfer(job.client, refundAmount);
        if (slashAmount > 0) {
            trustBondVault.slashBond(job.agentId, slashAmount, job.client);
        }
        agentRegistry.recordJobFailed(job.agentId, slashAmount);

        emit JobRefunded(jobId, job.client, refundAmount);
    }

    function splitAfterDispute(uint256 jobId, uint256 agentBps, uint256 clientBps) external nonReentrant onlyDisputeManager {
        require(agentBps + clientBps == 10_000, "AgentJobEscrow: bps must equal 10000");
        Job storage job = _getJobStorage(jobId);
        require(job.status == Status.Disputed, "AgentJobEscrow: not disputed");

        job.status = Status.Completed;
        job.resolvedAt = uint64(block.timestamp);

        uint256 agentAmount = (job.amount * agentBps) / 10_000;
        uint256 clientAmount = job.amount - agentAmount;
        if (agentAmount > 0) {
            _releaseTreasury(jobId, job.agentId, agentAmount);
            agentRegistry.recordJobCompleted(job.agentId, agentAmount);
        }
        if (clientAmount + job.clientBond > 0) {
            usdc.safeTransfer(job.client, clientAmount + job.clientBond);
            emit JobRefunded(jobId, job.client, clientAmount + job.clientBond);
        }
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        Job storage job = _getJobStorage(jobId);
        return job;
    }

    function _releaseTreasury(uint256 jobId, uint256 agentId, uint256 amount) private {
        AgentRegistry.AgentProfile memory agent = agentRegistry.getAgent(agentId);
        TreasuryPolicy memory policy = getTreasuryPolicy(agentId);

        uint256 operatingAmount = (amount * policy.operatingBps) / 10_000;
        uint256 reserveAmount = (amount * policy.reserveBps) / 10_000;
        uint256 bondAmount = amount - operatingAmount - reserveAmount;

        if (operatingAmount > 0) {
            usdc.safeTransfer(agent.operatingWallet, operatingAmount);
        }
        if (reserveAmount > 0) {
            usdc.safeTransfer(agent.reserveWallet, reserveAmount);
        }
        if (bondAmount > 0) {
            usdc.forceApprove(address(trustBondVault), bondAmount);
            trustBondVault.creditBondFromEscrow(agentId, bondAmount);
        }

        emit PaymentSplit(jobId, operatingAmount, reserveAmount, bondAmount);
    }

    function _returnClientBond(Job storage job) private {
        if (job.clientBond > 0) {
            usdc.safeTransfer(job.client, job.clientBond);
        }
    }

    function _payClientBondToAgent(Job storage job) private {
        if (job.clientBond > 0) {
            AgentRegistry.AgentProfile memory agent = agentRegistry.getAgent(job.agentId);
            usdc.safeTransfer(agent.operatingWallet, job.clientBond);
        }
    }

    function _escrowedBalance(Job storage job) private view returns (uint256) {
        if (job.fundedAt == 0) {
            return 0;
        }
        return job.amount + job.clientBond;
    }

    function _requireEvaluatorOrClient(Job storage job) private view {
        require(msg.sender == job.evaluator || msg.sender == job.client, "AgentJobEscrow: not evaluator/client");
    }

    function _getJobStorage(uint256 jobId) private view returns (Job storage job) {
        job = jobs[jobId];
        require(job.client != address(0), "AgentJobEscrow: nonexistent job");
    }
}

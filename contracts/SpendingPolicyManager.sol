// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

contract SpendingPolicyManager is Ownable {
    AgentRegistry public immutable agentRegistry;
    uint256 public nextExpenseId = 1;

    enum ExpenseType {
        Data,
        API,
        Compute,
        OtherAgent,
        Other
    }

    struct SpendingPolicy {
        uint256 maxSpendPerJob;
        uint256 dailySpendLimit;
        bool allowData;
        bool allowApi;
        bool allowCompute;
        bool allowOtherAgents;
        bool active;
    }

    struct Expense {
        uint256 expenseId;
        uint256 jobId;
        uint256 agentId;
        uint256 amount;
        ExpenseType expenseType;
        string note;
        uint64 createdAt;
    }

    mapping(uint256 => SpendingPolicy) private policies;
    mapping(uint256 => Expense) private expenses;
    mapping(uint256 => uint256) public jobSpend;
    mapping(uint256 => mapping(uint256 => uint256)) public agentDailySpend;
    mapping(address => bool) public authorizedOperators;

    event SpendingPolicyUpdated(uint256 indexed agentId, uint256 maxSpendPerJob, uint256 dailySpendLimit);
    event ExpenseLogged(uint256 indexed expenseId, uint256 indexed jobId, uint256 indexed agentId, uint256 amount, ExpenseType expenseType);
    event AuthorizedOperatorSet(address indexed operator, bool allowed);

    modifier onlyAgentOwner(uint256 agentId) {
        require(agentRegistry.ownerOfAgent(agentId) == msg.sender, "SpendingPolicyManager: not agent owner");
        _;
    }

    constructor(address agentRegistry_) Ownable(msg.sender) {
        require(agentRegistry_ != address(0), "SpendingPolicyManager: zero registry");
        agentRegistry = AgentRegistry(agentRegistry_);
    }

    function setPolicy(
        uint256 agentId,
        uint256 maxSpendPerJob,
        uint256 dailySpendLimit,
        bool allowData,
        bool allowApi,
        bool allowCompute,
        bool allowOtherAgents
    ) external onlyAgentOwner(agentId) {
        policies[agentId] = SpendingPolicy({
            maxSpendPerJob: maxSpendPerJob,
            dailySpendLimit: dailySpendLimit,
            allowData: allowData,
            allowApi: allowApi,
            allowCompute: allowCompute,
            allowOtherAgents: allowOtherAgents,
            active: true
        });

        emit SpendingPolicyUpdated(agentId, maxSpendPerJob, dailySpendLimit);
    }

    function getPolicy(uint256 agentId) external view returns (SpendingPolicy memory) {
        return policies[agentId];
    }

    function logExpense(
        uint256 jobId,
        uint256 agentId,
        uint256 amount,
        ExpenseType expenseType,
        string calldata note
    ) external returns (uint256) {
        require(
            authorizedOperators[msg.sender] || agentRegistry.ownerOfAgent(agentId) == msg.sender,
            "SpendingPolicyManager: not authorized"
        );
        require(amount > 0, "SpendingPolicyManager: zero amount");

        SpendingPolicy memory policy = policies[agentId];
        require(policy.active, "SpendingPolicyManager: inactive policy");
        require(_expenseTypeAllowed(policy, expenseType), "SpendingPolicyManager: expense type blocked");
        require(jobSpend[jobId] + amount <= policy.maxSpendPerJob, "SpendingPolicyManager: job limit exceeded");

        uint256 day = block.timestamp / 1 days;
        require(agentDailySpend[agentId][day] + amount <= policy.dailySpendLimit, "SpendingPolicyManager: daily limit exceeded");

        uint256 expenseId = nextExpenseId++;
        expenses[expenseId] = Expense({
            expenseId: expenseId,
            jobId: jobId,
            agentId: agentId,
            amount: amount,
            expenseType: expenseType,
            note: note,
            createdAt: uint64(block.timestamp)
        });
        jobSpend[jobId] += amount;
        agentDailySpend[agentId][day] += amount;

        try agentRegistry.recordToolSpend(agentId, amount) {} catch {}

        emit ExpenseLogged(expenseId, jobId, agentId, amount, expenseType);
        return expenseId;
    }

    function getExpense(uint256 expenseId) external view returns (Expense memory) {
        require(expenses[expenseId].createdAt != 0, "SpendingPolicyManager: nonexistent expense");
        return expenses[expenseId];
    }

    function getJobSpend(uint256 jobId) external view returns (uint256) {
        return jobSpend[jobId];
    }

    function getAgentDailySpend(uint256 agentId, uint256 day) external view returns (uint256) {
        return agentDailySpend[agentId][day];
    }

    function setAuthorizedOperator(address operator, bool allowed) external onlyOwner {
        require(operator != address(0), "SpendingPolicyManager: zero operator");
        authorizedOperators[operator] = allowed;
        emit AuthorizedOperatorSet(operator, allowed);
    }

    function _expenseTypeAllowed(SpendingPolicy memory policy, ExpenseType expenseType) private pure returns (bool) {
        if (expenseType == ExpenseType.Data) {
            return policy.allowData;
        }
        if (expenseType == ExpenseType.API) {
            return policy.allowApi;
        }
        if (expenseType == ExpenseType.Compute) {
            return policy.allowCompute;
        }
        if (expenseType == ExpenseType.OtherAgent) {
            return policy.allowOtherAgents;
        }
        return true;
    }
}

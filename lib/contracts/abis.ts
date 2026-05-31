export const MOCK_USDC_ABI = [
  "function decimals() view returns (uint8)",
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)"
] as const;

export const AGENT_REGISTRY_ABI = [
  "event AgentRegistered(uint256 indexed agentId, address indexed owner, string name, string category, address operatingWallet, address reserveWallet)",
  "event AgentDeactivated(uint256 indexed agentId)",
  "function nextAgentId() view returns (uint256)",
  "function authorizedUpdaters(address updater) view returns (bool)",
  "function registerAgent(string name, string category, string metadataURI, bytes32 skillsHash, address operatingWallet, address reserveWallet) returns (uint256)",
  "function deactivateAgent(uint256 agentId)",
  "function getAgent(uint256 agentId) view returns (tuple(uint256 agentId, address owner, string name, string category, string metadataURI, bytes32 skillsHash, address operatingWallet, address reserveWallet, bool active, uint64 createdAt))",
  "function getStats(uint256 agentId) view returns (tuple(uint256 completedJobs, uint256 failedJobs, uint256 disputedJobs, uint256 lifetimeEarned, uint256 totalEscrowed, uint256 totalSlashed, uint256 totalToolSpend, uint64 lastActiveAt))",
  "function ownerOfAgent(uint256 agentId) view returns (address)",
  "function isActiveAgent(uint256 agentId) view returns (bool)",
  "function getReputationScore(uint256 agentId) view returns (uint256)"
] as const;

export const CLIENT_REGISTRY_ABI = [
  "function authorizedUpdaters(address updater) view returns (bool)",
  "function getClientStats(address client) view returns (tuple(uint256 jobsCreated, uint256 jobsApproved, uint256 jobsRejected, uint256 disputesLost, uint256 disputesWon, uint256 totalPaid, uint256 totalRefunded, uint256 totalBondSlashed))",
  "function getClientScore(address client) view returns (uint256)"
] as const;

export const TRUST_BOND_VAULT_ABI = [
  "event BondDeposited(uint256 indexed agentId, address indexed owner, uint256 amount)",
  "function authorizedOperators(address operator) view returns (bool)",
  "function depositBond(uint256 agentId, uint256 amount)",
  "function requestWithdraw(uint256 agentId, uint256 amount)",
  "function executeWithdraw(uint256 agentId)",
  "function cancelWithdraw(uint256 agentId)",
  "function bondOf(uint256 agentId) view returns (uint256)"
] as const;

export const SPENDING_POLICY_MANAGER_ABI = [
  "event SpendingPolicyUpdated(uint256 indexed agentId, uint256 maxSpendPerJob, uint256 dailySpendLimit)",
  "event ExpenseLogged(uint256 indexed expenseId, uint256 indexed jobId, uint256 indexed agentId, uint256 amount, uint8 expenseType)",
  "function setPolicy(uint256 agentId, uint256 maxSpendPerJob, uint256 dailySpendLimit, bool allowData, bool allowApi, bool allowCompute, bool allowOtherAgents)",
  "function getPolicy(uint256 agentId) view returns (tuple(uint256 maxSpendPerJob, uint256 dailySpendLimit, bool allowData, bool allowApi, bool allowCompute, bool allowOtherAgents, bool active))",
  "function logExpense(uint256 jobId, uint256 agentId, uint256 amount, uint8 expenseType, string note) returns (uint256)",
  "function getExpense(uint256 expenseId) view returns (tuple(uint256 expenseId, uint256 jobId, uint256 agentId, uint256 amount, uint8 expenseType, string note, uint64 createdAt))",
  "function getJobSpend(uint256 jobId) view returns (uint256)"
] as const;

export const AGENT_JOB_ESCROW_ABI = [
  "event JobCreated(uint256 indexed jobId, uint256 indexed agentId, address indexed client, address evaluator, uint256 amount, uint256 clientBond, uint64 deadline, string jobURI)",
  "event JobFunded(uint256 indexed jobId, uint256 amount, uint256 clientBond)",
  "event JobRunning(uint256 indexed jobId)",
  "event DeliverableSubmitted(uint256 indexed jobId, string deliverableURI)",
  "event JobCompleted(uint256 indexed jobId)",
  "event JobMovedToDispute(uint256 indexed jobId, uint256 indexed disputeId, string reasonURI)",
  "function nextJobId() view returns (uint256)",
  "function disputeManager() view returns (address)",
  "function getTreasuryPolicy(uint256 agentId) view returns (tuple(uint256 operatingBps, uint256 reserveBps, uint256 bondBps))",
  "function createJob(uint256 agentId, address evaluator, uint256 amount, uint256 clientBond, uint64 deadline, string jobURI) returns (uint256)",
  "function fundJob(uint256 jobId)",
  "function markRunning(uint256 jobId)",
  "function submitDeliverable(uint256 jobId, string deliverableURI)",
  "function approveAndRelease(uint256 jobId)",
  "function rejectToDispute(uint256 jobId, string reasonURI)",
  "function expireAndRefund(uint256 jobId)",
  "function setTreasuryPolicy(uint256 agentId, uint256 operatingBps, uint256 reserveBps, uint256 bondBps)",
  "function getJob(uint256 jobId) view returns (tuple(uint256 jobId, uint256 agentId, address client, address evaluator, uint256 amount, uint256 clientBond, uint64 deadline, string jobURI, string deliverableURI, uint8 status, uint64 createdAt, uint64 fundedAt, uint64 runningAt, uint64 submittedAt, uint64 resolvedAt))"
] as const;

export const DISPUTE_MANAGER_ABI = [
  "event DisputeOpened(uint256 indexed disputeId, uint256 indexed jobId, address indexed openedBy, string reasonURI)",
  "event EvidenceSubmitted(uint256 indexed disputeId, string evidenceURI)",
  "event DisputeResolved(uint256 indexed disputeId, uint256 indexed jobId, uint8 outcome)",
  "function nextDisputeId() view returns (uint256)",
  "function jobToDispute(uint256 jobId) view returns (uint256)",
  "function submitEvidence(uint256 disputeId, string evidenceURI)",
  "function resolveAgentWins(uint256 disputeId)",
  "function resolveClientWins(uint256 disputeId, uint256 slashAmount)",
  "function resolveSplit(uint256 disputeId, uint256 agentBps, uint256 clientBps)",
  "function getDispute(uint256 disputeId) view returns (tuple(uint256 disputeId, uint256 jobId, address openedBy, string reasonURI, string evidenceURI, uint8 outcome, bool resolved, uint64 createdAt, uint64 resolvedAt))"
] as const;

export const ABIS = {
  MockUSDC: MOCK_USDC_ABI,
  AgentRegistry: AGENT_REGISTRY_ABI,
  ClientRegistry: CLIENT_REGISTRY_ABI,
  TrustBondVault: TRUST_BOND_VAULT_ABI,
  SpendingPolicyManager: SPENDING_POLICY_MANAGER_ABI,
  AgentJobEscrow: AGENT_JOB_ESCROW_ABI,
  DisputeManager: DISPUTE_MANAGER_ABI
} as const;

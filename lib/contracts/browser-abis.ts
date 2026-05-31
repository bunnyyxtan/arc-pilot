import { parseAbi, type Abi, type AbiParameter } from "viem";

const functionAbi = <
  const TInputs extends readonly AbiParameter[],
  const TOutputs extends readonly AbiParameter[]
>(name: string, inputs: TInputs, outputs: TOutputs) => ({
  type: "function",
  name,
  stateMutability: "view",
  inputs,
  outputs
} as const);

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
]);

const getAgentAbi = functionAbi(
  "getAgent",
  [{ name: "agentId", type: "uint256" }],
  [{
    name: "",
    type: "tuple",
    components: [
      { name: "agentId", type: "uint256" },
      { name: "owner", type: "address" },
      { name: "name", type: "string" },
      { name: "category", type: "string" },
      { name: "metadataURI", type: "string" },
      { name: "skillsHash", type: "bytes32" },
      { name: "operatingWallet", type: "address" },
      { name: "reserveWallet", type: "address" },
      { name: "active", type: "bool" },
      { name: "createdAt", type: "uint64" }
    ]
  }]
);

const getStatsAbi = functionAbi(
  "getStats",
  [{ name: "agentId", type: "uint256" }],
  [{
    name: "",
    type: "tuple",
    components: [
      { name: "completedJobs", type: "uint256" },
      { name: "failedJobs", type: "uint256" },
      { name: "disputedJobs", type: "uint256" },
      { name: "lifetimeEarned", type: "uint256" },
      { name: "totalEscrowed", type: "uint256" },
      { name: "totalSlashed", type: "uint256" },
      { name: "totalToolSpend", type: "uint256" },
      { name: "lastActiveAt", type: "uint64" }
    ]
  }]
);

export const agentRegistryAbi = [
  ...parseAbi([
    "function nextAgentId() view returns (uint256)",
    "function registerAgent(string name, string category, string metadataURI, bytes32 skillsHash, address operatingWallet, address reserveWallet) returns (uint256)",
    "function ownerOfAgent(uint256 agentId) view returns (address)",
    "function getReputationScore(uint256 agentId) view returns (uint256)"
  ]),
  getAgentAbi,
  getStatsAbi
] as const satisfies Abi;

const getClientStatsAbi = functionAbi(
  "getClientStats",
  [{ name: "client", type: "address" }],
  [{
    name: "",
    type: "tuple",
    components: [
      { name: "jobsCreated", type: "uint256" },
      { name: "jobsApproved", type: "uint256" },
      { name: "jobsRejected", type: "uint256" },
      { name: "disputesLost", type: "uint256" },
      { name: "disputesWon", type: "uint256" },
      { name: "totalPaid", type: "uint256" },
      { name: "totalRefunded", type: "uint256" },
      { name: "totalBondSlashed", type: "uint256" }
    ]
  }]
);

export const clientRegistryAbi = [
  ...parseAbi([
    "function getClientScore(address client) view returns (uint256)"
  ]),
  getClientStatsAbi
] as const satisfies Abi;

export const trustBondVaultAbi = parseAbi([
  "function depositBond(uint256 agentId, uint256 amount)",
  "function requestWithdraw(uint256 agentId, uint256 amount)",
  "function executeWithdraw(uint256 agentId)",
  "function cancelWithdraw(uint256 agentId)",
  "function bondOf(uint256 agentId) view returns (uint256)"
]);

const getPolicyAbi = functionAbi(
  "getPolicy",
  [{ name: "agentId", type: "uint256" }],
  [{
    name: "",
    type: "tuple",
    components: [
      { name: "maxSpendPerJob", type: "uint256" },
      { name: "dailySpendLimit", type: "uint256" },
      { name: "allowData", type: "bool" },
      { name: "allowApi", type: "bool" },
      { name: "allowCompute", type: "bool" },
      { name: "allowOtherAgents", type: "bool" },
      { name: "active", type: "bool" }
    ]
  }]
);

export const spendingPolicyManagerAbi = [
  ...parseAbi([
    "function setPolicy(uint256 agentId, uint256 maxSpendPerJob, uint256 dailySpendLimit, bool allowData, bool allowApi, bool allowCompute, bool allowOtherAgents)"
  ]),
  getPolicyAbi
] as const satisfies Abi;

const getTreasuryPolicyAbi = functionAbi(
  "getTreasuryPolicy",
  [{ name: "agentId", type: "uint256" }],
  [{
    name: "",
    type: "tuple",
    components: [
      { name: "operatingBps", type: "uint256" },
      { name: "reserveBps", type: "uint256" },
      { name: "bondBps", type: "uint256" }
    ]
  }]
);

const getJobAbi = functionAbi(
  "getJob",
  [{ name: "jobId", type: "uint256" }],
  [{
    name: "",
    type: "tuple",
    components: [
      { name: "jobId", type: "uint256" },
      { name: "agentId", type: "uint256" },
      { name: "client", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "clientBond", type: "uint256" },
      { name: "deadline", type: "uint64" },
      { name: "jobURI", type: "string" },
      { name: "deliverableURI", type: "string" },
      { name: "status", type: "uint8" },
      { name: "createdAt", type: "uint64" },
      { name: "fundedAt", type: "uint64" },
      { name: "runningAt", type: "uint64" },
      { name: "submittedAt", type: "uint64" },
      { name: "resolvedAt", type: "uint64" }
    ]
  }]
);

export const agentJobEscrowAbi = [
  ...parseAbi([
    "function nextJobId() view returns (uint256)",
    "function setTreasuryPolicy(uint256 agentId, uint256 operatingBps, uint256 reserveBps, uint256 bondBps)",
    "function createJob(uint256 agentId, address evaluator, uint256 amount, uint256 clientBond, uint64 deadline, string jobURI) returns (uint256)",
    "function fundJob(uint256 jobId)",
    "function markRunning(uint256 jobId)",
    "function submitDeliverable(uint256 jobId, string deliverableURI)",
    "function approveAndRelease(uint256 jobId)",
    "function rejectToDispute(uint256 jobId, string reasonURI)",
    "function expireAndRefund(uint256 jobId)"
  ]),
  getTreasuryPolicyAbi,
  getJobAbi
] as const satisfies Abi;

const getDisputeAbi = functionAbi(
  "getDispute",
  [{ name: "disputeId", type: "uint256" }],
  [{
    name: "",
    type: "tuple",
    components: [
      { name: "disputeId", type: "uint256" },
      { name: "jobId", type: "uint256" },
      { name: "openedBy", type: "address" },
      { name: "reasonURI", type: "string" },
      { name: "evidenceURI", type: "string" },
      { name: "outcome", type: "uint8" },
      { name: "resolved", type: "bool" },
      { name: "createdAt", type: "uint64" },
      { name: "resolvedAt", type: "uint64" }
    ]
  }]
);

export const disputeManagerAbi = [
  ...parseAbi([
    "function nextDisputeId() view returns (uint256)",
    "function resolvers(address resolver) view returns (bool)",
    "function owner() view returns (address)",
    "function submitEvidence(uint256 disputeId, string evidenceURI)",
    "function resolveAgentWins(uint256 disputeId)",
    "function resolveClientWins(uint256 disputeId, uint256 slashAmount)",
    "function resolveSplit(uint256 disputeId, uint256 agentBps, uint256 clientBps)"
  ]),
  getDisputeAbi
] as const satisfies Abi;

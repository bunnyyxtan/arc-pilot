# ArcPilot Context

ArcPilot is a financial OS for AI agents on Arc. It combines Solidity contracts, local and Arc Testnet deployment tooling, an SDK, event indexer, backend API routes, an OpenAI agent runner, and a frontend that reads real contract/indexer data.

## Architecture

- `contracts/`: Solidity source for agent identity, client reputation, USDC escrow, trust bonds, spending policy, disputes, and payment splits.
- `test/`: Hardhat contract tests using 6-decimal MockUSDC.
- `scripts/`: local/testnet deployment, verification, smoke, read, demo, and operational scripts.
- `lib/contracts/`: ABIs, deployment artifacts, address loading, runtime helpers, verification helpers.
- `lib/sdk/`: typed read/write helpers over deployed contracts. API routes and scripts should prefer these helpers.
- `lib/indexer/`: reads real contract events and builds agent/job/dispute lists.
- `lib/openai/`: GPT runner, prompt builders, hashed deliverable storage.
- `app/api/`: App Router API routes for SDK reads/writes and agent execution.
- `app/` and `components/`: frontend views and UI components. The frontend must not use fake product data.

## Data Flow

1. Contracts emit events during registration, escrow funding, submissions, disputes, and releases.
2. The indexer reads real events from deployed contracts.
3. The SDK reads contract state and indexed logs.
4. API routes expose reads/writes to the frontend and scripts.
5. The frontend consumes SDK-backed API data.
6. The OpenAI runner generates deliverables.
7. Deliverables are saved locally as JSON under `data/deliverables/` with a keccak256 hash.
8. Job submission stores `local-deliverable://<hash>` onchain.
9. Approval releases USDC and enables a verified client rating and review.

## Contract Flow

Register an agent, deposit trust bond, set spending policy, create a USDC job escrow, fund it, mark it running, submit a deliverable URI, then approve/reject/dispute. The deployed contract keeps funding, agent-owner start, and agent-owner submission as separate wallet transactions. After Start Work confirms, the frontend automatically runs offchain AI generation and presents the protected URI for submission. Approval splits payment into operating, reserve, and trust-bond buckets. Disputes are opened by escrow and resolved by `DisputeManager`.

The current deployment has no batch, multicall, permit, relayer, or authorized-runner path. ERC-20 approval, escrow funding, agent-owner start, and agent-owner submission remain honest wallet confirmations. A future V2 can add `fundAndStartJob`, batch execution, and session-key or account-abstraction support.

Job classification is canonical metadata: `marketplace` or `self_use`. Explicit saved classification overrides wallet-equality inference. Equality is a fallback only for older jobs without classification metadata.

## API And SDK Flow

API routes should call `lib/sdk` or `lib/indexer` instead of duplicating contract logic. SDK write helpers require a private key from local/demo env or request body; never log those keys. API errors should preserve the existing `{ ok: false, error }` shape.

## Indexer Flow

`lib/indexer/events.ts` queries contract event filters and normalizes event args. Agent/job/dispute list builders collect IDs from events, then read current contract state through SDK views. Empty lists usually mean no relevant events have been emitted or the wrong deployment artifact/RPC is active.

## Frontend Data Rule

The frontend must render real SDK/API/indexer data. Empty states are allowed; fake dashboard/product records are not.

## Local Demo Flow

Terminal 1:

```bash
npx hardhat node --hostname 127.0.0.1 --port 8545
```

Terminal 2:

```bash
npm run arc:deploy-local
npm run arc:verify-local
npm run arc:smoke
npm run arc:demo
```

`arc:demo` requires `OPENAI_API_KEY`. `arc:smoke` does not call OpenAI.

## Arc Testnet Deploy Flow

```bash
npm run arc:check-env
npm run arc:testnet:faucet-check
npm run arc:deploy-testnet
npm run arc:verify-testnet
npm run arc:testnet:read
npm run arc:testnet:smoke
```

Use a fresh testnet wallet. Never use public Hardhat keys on Arc Testnet or any live network.

## Common Failure Points

- `ECONNREFUSED 127.0.0.1:8545`: local Hardhat node is not running.
- Chain ID mismatch: wrong RPC URL or wrong network mode.
- Empty dashboard: contracts were redeployed and no smoke/demo events have been emitted.
- Missing bytecode: stale deployment artifact or wrong network.
- USDC decimals mismatch: local MockUSDC and Arc Testnet ERC-20 USDC should read `6`.
- OpenAI failure: `OPENAI_API_KEY` missing or the model response was not valid JSON.
- Write route failure: local/demo private key missing from env or request body.

## Debugging Commands

```bash
npm run typecheck
npm run build
npm run arc:check-env
npm run arc:verify-local
npm run arc:smoke
npm run arc:list-agents
npm run arc:list-jobs
npm run arc:list-disputes
npm run arc:testnet:faucet-check
npm run arc:verify-testnet
```

## Logging

Structured logs are emitted through `lib/logger.ts` as JSON with `timestamp`, `level`, `module`, `action`, `message`, and sanitized `context`. Set `ARCPILOT_LOG_LEVEL=DEBUG` for more detail. Do not log private keys, `OPENAI_API_KEY`, authorization headers, raw `.env` contents, or full generated content.

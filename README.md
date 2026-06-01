# ArcPilot

Financial OS for AI agents on Arc.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Hardhat
- Solidity
- OpenZeppelin later
- wagmi/viem later
- OpenAI API later
- Supabase optional server persistence/index cache

## Phase Roadmap

- Phase 0: Repository setup
- Phase 1: Smart contract foundations
- Phase 2: Frontend shell and dashboards
- Phase 3: GPT agent runner
- Phase 4: Wallet integration
- Phase 5: Arc Testnet deployment

## Local Setup

```bash
npm install
npm run typecheck
npm run compile
npm run build
```

## Local Engine Demo

Terminal 1:

```bash
npx hardhat node
```

Terminal 2:

```bash
npx hardhat run scripts/deploy-local.ts --network localhost
npm run arc:demo
```

Required local env values:

- `OPENAI_API_KEY`
- `DEMO_CLIENT_PRIVATE_KEY`
- `DEMO_AGENT_OWNER_PRIVATE_KEY`

Use local Hardhat private keys only for localhost development. Never use public Hardhat private keys on live networks.

## Recommended Local Verification Flow

Terminal 1:

```bash
npx hardhat node
```

Terminal 2:

```bash
npx hardhat run scripts/deploy-local.ts --network localhost
npm run arc:verify-local
npm run arc:smoke
npm run arc:demo
```

Required local env:

```env
OPENAI_API_KEY=
DEMO_CLIENT_PRIVATE_KEY=
DEMO_AGENT_OWNER_PRIVATE_KEY=
LOCAL_RPC_URL=http://127.0.0.1:8545
```

Use local Hardhat private keys only for localhost. Never use public Hardhat private keys on Arc Testnet or any live network.

## Arc Testnet Deployment Flow

```bash
npm run arc:check-env
npm run arc:deploy-testnet
npm run arc:verify-testnet
npm run arc:export-addresses
```

`NEXT_PUBLIC_USDC_ADDRESS` is optional for deployment; if omitted, the Arc Testnet USDC fallback is used. `DEPLOYER_PRIVATE_KEY` must come from local env only.

## Arc Testnet Deployment

Use a fresh testnet wallet. Never use a wallet with real funds. Never commit `.env`.

Arc Testnet uses USDC as gas. The ERC-20 USDC interface uses 6 decimals.

```bash
npm run arc:check-env
npm run arc:testnet:faucet-check
npm run arc:deploy-testnet
npm run arc:verify-testnet
npm run arc:testnet:read
npm run arc:testnet:smoke
```

## SDK and Indexer

The `lib/sdk` modules read real ArcPilot contracts and perform writes only when a private key is explicitly provided. The `lib/indexer` helpers build agent, job, and dispute lists from real contract logs; no mock data is used. The frontend can later consume these services instead of duplicating contract logic.

```bash
npm run arc:index-local
npm run arc:list-agents
AGENT_ID=1 npm run arc:read-agent
npm run arc:list-jobs
JOB_ID=1 npm run arc:read-job
npm run arc:list-disputes
DISPUTE_ID=1 npm run arc:read-dispute
```

## Supabase Persistence

Supabase is the required production persistence layer. Deliverables are saved to the `deliverables` table; local JSON fallback is available only during development. Agent, job, and dispute APIs prefer Supabase indexed records and use live Arc Testnet reads for freshness where available.

Apply [lib/supabase/schema.sql](./lib/supabase/schema.sql) in the Supabase SQL editor before production deployment. The migration is additive: it preserves existing records, expands `indexed_agents` into the canonical agent table, and adds idempotent `app_events.source`, `payload`, and `event_key` fields.

Required env:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Optional AI dispute review behavior:

```env
AUTO_RUN_AI_DISPUTE_REVIEW=false
```

When set to `true`, opening a dispute page generates one persisted AI review if none exists. The AI review is a recommendation only. Onchain resolution still requires a connected resolver/admin wallet.

Restricted deliverable reads also require a server-only wallet-session secret:

```env
ARC_WALLET_SESSION_SECRET=
```

Use at least 32 random characters. The app asks the connected browser wallet to sign a short ArcPilot challenge before revealing protected output. Wallet addresses supplied in query parameters or custom headers are ignored.

Check and sync:

```bash
npm run arc:supabase:check
npm run arc:supabase:sync
npm run arc:health:check
```

The application also exposes production-safe diagnostics at `/engine/diagnostics`, `/api/health`, and `/api/health/supabase`. These routes report readiness and table counts only; they never expose secret values.

`npm run arc:supabase:sync` also promotes existing development deliverable JSON into Supabase. Run it after applying the schema migration so previously generated reports remain available when production local-file fallback is disabled.

For Vercel, configure the Arc Testnet contract addresses, `ARC_TESTNET_RPC_URL`, Supabase variables, `ARC_WALLET_SESSION_SECRET`, and `OPENAI_API_KEY` in the project environment. Use a wallet-session secret of at least 32 random characters. Do not rely on `data/deliverables/` in production because serverless filesystems are ephemeral.

Never expose or log `SUPABASE_SERVICE_ROLE_KEY`; it is server-only.

## Security

Never expose private keys or `OPENAI_API_KEY`. Keep real secrets in local `.env` files only, and do not commit them.

## Wallet Session Access QA

Run `npm run arc:deliverable-access:check` after changing deliverable access rules. For manual QA, use separate wallets: wallet A as agent owner, wallet B as client or evaluator, and an incognito browser without a wallet. Verify that a Running draft is locked for wallet B and incognito, submitted restricted output is preview-only for wallet B after signed verification, and completed public output opens without a signed session.

Generated marketplace output is sealed until escrow approval, including for the agent owner. A job can be explicitly classified as `self_use` when the client wallet owns the selected agent; that test-run mode remains auditable but is excluded from public marketplace reputation. Treasury pages intentionally continue to show raw onchain accounting, while public passports and dashboard reputation use third-party client work only.

import { getAgentView } from "../lib/sdk/agents";
import { bigintJson } from "../lib/sdk/types";

const agentId = process.env.AGENT_ID;
if (!agentId) {
  throw new Error("AGENT_ID is required.");
}

console.log(JSON.stringify(bigintJson({ agent: await getAgentView(BigInt(agentId)) }), null, 2));

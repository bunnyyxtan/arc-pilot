import { NextResponse } from "next/server";
import { logger } from "../../../../lib/logger";
import { runAgentJob } from "../../../../lib/openai/agent-runner";
import { isDeliverableType } from "../../../../lib/openai/prompts";

export async function POST(request: Request) {
  logger.info("api.agentRunner", "run:received", {}, "Agent runner request received");
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { agentName, agentCategory, jobTitle, jobDescription, deliverableType } = body;

    if (
      typeof agentName !== "string" ||
      typeof agentCategory !== "string" ||
      typeof jobTitle !== "string" ||
      typeof jobDescription !== "string" ||
      !agentName.trim() ||
      !agentCategory.trim() ||
      !jobTitle.trim() ||
      !jobDescription.trim()
    ) {
      logger.warn("api.agentRunner", "run:validationFailed", {
        hasAgentName: typeof agentName === "string" && Boolean(agentName.trim()),
        hasAgentCategory: typeof agentCategory === "string" && Boolean(agentCategory.trim()),
        hasJobTitle: typeof jobTitle === "string" && Boolean(jobTitle.trim()),
        hasJobDescription: typeof jobDescription === "string" && Boolean(jobDescription.trim())
      }, "Agent runner request is missing required fields");
      return NextResponse.json({ ok: false, error: "Missing required agent/job fields." }, { status: 400 });
    }

    if (!isDeliverableType(deliverableType)) {
      logger.warn("api.agentRunner", "run:invalidDeliverableType", { deliverableType }, "Invalid deliverable type");
      return NextResponse.json({ ok: false, error: "Invalid deliverableType." }, { status: 400 });
    }

    const jobId = typeof body.jobId === "string" || typeof body.jobId === "number" || typeof body.jobId === "bigint" ? String(body.jobId) : null;
    if (jobId) {
      return NextResponse.json({
        ok: false,
        error: `Job-linked AI runs must use /api/jobs/${jobId}/run so ArcPilot can verify the registered agent owner.`
      }, { status: 400 });
    }
    logger.info("api.agentRunner", "run:sdkCallStart", {
      agentName,
      agentCategory,
      jobTitle,
      deliverableType
    }, "Calling OpenAI agent runner");
    const deliverable = await runAgentJob({
      agentName,
      agentCategory,
      jobTitle,
      jobDescription,
      deliverableType,
      chainId: typeof body.chainId === "number" ? body.chainId : typeof body.chainId === "string" && body.chainId ? Number(body.chainId) : null,
      jobId,
      agentId: typeof body.agentId === "string" || typeof body.agentId === "number" || typeof body.agentId === "bigint" ? String(body.agentId) : null,
      createdByWallet: typeof body.createdByWallet === "string" ? body.createdByWallet : null,
      txHash: typeof body.txHash === "string" ? body.txHash : null,
      visibility: body.visibility === "public" ? "public" : "restricted",
      clientWallet: typeof body.clientWallet === "string" ? body.clientWallet : null,
      agentOwnerWallet: typeof body.agentOwnerWallet === "string" ? body.agentOwnerWallet : null,
      evaluatorWallet: typeof body.evaluatorWallet === "string" ? body.evaluatorWallet : null
      ,
      agentSkills: Array.isArray(body.agentSkills) ? body.agentSkills.filter((item): item is string => typeof item === "string") : [],
      agentMetadata: body.agentMetadata ?? null
    });

    logger.info("api.agentRunner", "run:success", {
      deliverableHash: deliverable.deliverableHash,
      deliverableURI: deliverable.deliverableURI
    }, "Agent runner request completed");
    return NextResponse.json({ ok: true, deliverable });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent runner failed.";
    logger.error("api.agentRunner", "run:failed", { error }, "Agent runner request failed");
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

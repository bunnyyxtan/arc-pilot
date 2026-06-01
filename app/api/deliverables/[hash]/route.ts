import { NextResponse } from "next/server";
import { isResolverAdminWallet } from "../../../../lib/auth/resolver";
import { getVerifiedWalletFromRequest } from "../../../../lib/auth/wallet-session";
import { getDeliverableAccess, normalizeWallet } from "../../../../lib/deliverables/access";
import { getDeliverableVisibility, toApiDeliverable } from "../../../../lib/deliverables/payload";
import { logger } from "../../../../lib/logger";
import { deliverableURI, readDeliverableWithSource } from "../../../../lib/openai/deliverable";
import { getAgent } from "../../../../lib/sdk/agents";
import { getSdkContracts } from "../../../../lib/sdk/arcpilot";
import { getJobView } from "../../../../lib/sdk/jobs";
import { decodeJobURI } from "../../../../lib/contracts/job-uri";
import { isSelfUseJob, resolveJobClassification } from "../../../../lib/jobs/classification";

async function isResolverWallet(viewer: string) {
  const wallet = normalizeWallet(viewer);
  if (!wallet) return false;
  if (isResolverAdminWallet(wallet)) return true;
  try {
    const contracts = getSdkContracts();
    const [listed, owner] = await Promise.all([
      contracts.DisputeManager.resolvers(wallet),
      contracts.DisputeManager.owner()
    ]);
    return Boolean(listed) || normalizeWallet(String(owner)) === wallet;
  } catch (error) {
    logger.warn("api.deliverables", "read:resolverUnavailable", { error }, "Deliverable resolver role lookup failed");
    return false;
  }
}

export async function GET(request: Request, context: { params: Promise<{ hash: string }> }) {
  const { hash } = await context.params;
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    return NextResponse.json({ ok: false, error: "Invalid deliverable hash." }, { status: 400 });
  }
  const viewer = getVerifiedWalletFromRequest(request) || "";
  logger.info("api.deliverables", "read:received", { hash, hasVerifiedWallet: Boolean(viewer) }, "Deliverable read request received");
  let result;
  try {
    result = await readDeliverableWithSource(hash);
  } catch (error) {
    logger.error("api.deliverables", "read:storageUnavailable", { hash, error }, "Deliverable storage read failed");
    return NextResponse.json({ ok: false, error: "Deliverable storage is unavailable. Check Supabase production configuration." }, { status: 503 });
  }

  if (!result) {
    logger.warn("api.deliverables", "read:notFound", { hash }, "Deliverable was not found");
    return NextResponse.json({ ok: false, error: "Deliverable not found" }, { status: 404 });
  }

  let jobStatus: number | null = null;
  let jobStatusLabel = "Saved";
  let isSubmittedOnchain = false;
  let agentOwner = "";
  let clientWallet = "";
  let evaluatorWallet = "";
  let isSelfUse = false;
  let selfUseExplicit = false;
  if (result.deliverable.jobId) {
    try {
      const job = await getJobView(result.deliverable.jobId);
      jobStatus = job.status;
      jobStatusLabel = job.statusLabel;
      clientWallet = String(job.client);
      evaluatorWallet = String(job.evaluator);
      const savedURI = result.deliverable.deliverableURI || deliverableURI(result.deliverable.hash);
      isSubmittedOnchain = Boolean(job.deliverableURI && job.deliverableURI === savedURI);
      const agent = await getAgent(job.agentId);
      agentOwner = String(agent.owner);
      const decoded = decodeJobURI(job.jobURI);
      const jobClassification = resolveJobClassification({
        metadataClassification: decoded?.jobClassification ?? decoded?.jobMode,
        clientWallet,
        agentOwnerWallet: agentOwner
      });
      isSelfUse = isSelfUseJob({ explicitClassification: jobClassification });
      selfUseExplicit = jobClassification === "self_use" && Boolean(decoded?.jobClassification === "self_use" || decoded?.jobMode === "self_use");
    } catch (error) {
      logger.warn("api.deliverables", "read:onchainContextUnavailable", { hash, jobId: result.deliverable.jobId, error }, "Deliverable onchain context lookup failed");
    }
  }

  const visibility = getDeliverableVisibility(result.deliverable);
  const policy = getDeliverableAccess({
    jobStatus,
    isSubmittedOnchain,
    visibility,
    viewerWallet: viewer,
    agentOwner,
    clientWallet,
    evaluatorWallet,
    isResolver: await isResolverWallet(viewer),
    isSelfUse,
    selfUseExplicit
  });
  logger.info("api.deliverables", "read:success", {
    hash,
    source: result.source,
    access: policy.access,
    mode: policy.mode,
    jobStatus: jobStatusLabel,
    isSubmittedOnchain,
    isSelfUse,
    selfUseExplicit,
    viewerRole: policy.viewerRole
  }, "Deliverable read request completed");
  return NextResponse.json({
    ok: true,
    access: policy.access,
    mode: policy.mode,
    source: result.source,
    jobStatus: jobStatusLabel,
    isSubmittedOnchain,
    isSelfUse,
    selfUseExplicit,
    verifiedWallet: Boolean(viewer),
    viewerRole: policy.viewerRole,
    message: policy.message,
    deliverable: toApiDeliverable(result.deliverable, policy.access)
  });
}

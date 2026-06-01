export type DeliverableAccess = "full" | "preview" | "locked";
export type DeliverableMode = "draft" | "preview" | "full" | "locked" | "disputed";
export type DeliverableViewerRole = "agent_owner" | "client" | "evaluator" | "resolver" | "public" | "unknown";

export type DeliverableAccessInput = {
  jobStatus: number | null;
  isSubmittedOnchain: boolean;
  visibility: "public" | "restricted";
  viewerWallet?: string | null;
  agentOwner?: string | null;
  clientWallet?: string | null;
  evaluatorWallet?: string | null;
  isResolver?: boolean;
  isSelfUse?: boolean;
  selfUseExplicit?: boolean;
};

export type DeliverableAccessResult = {
  access: DeliverableAccess;
  mode: DeliverableMode;
  viewerRole: DeliverableViewerRole;
  message: string;
};

export function normalizeWallet(value?: string | null) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value) ? value.toLowerCase() : "";
}

export function getDeliverableViewerRole(input: DeliverableAccessInput): DeliverableViewerRole {
  const viewer = normalizeWallet(input.viewerWallet);
  if (!viewer) return "public";
  if (normalizeWallet(input.agentOwner) === viewer) return "agent_owner";
  if (normalizeWallet(input.clientWallet) === viewer) return "client";
  if (normalizeWallet(input.evaluatorWallet) === viewer) return "evaluator";
  if (input.isResolver) return "resolver";
  return "unknown";
}

function draftResult(role: DeliverableViewerRole, input: DeliverableAccessInput): DeliverableAccessResult {
  if (role === "agent_owner") {
    const selfUseUnlocked = input.isSelfUse === true && input.selfUseExplicit === true;
    return {
      access: selfUseUnlocked ? "full" : "preview",
      mode: "draft",
      viewerRole: role,
      message: selfUseUnlocked
        ? "Explicit self-use output unlocked for the registered owner. This run does not count toward public marketplace ratings."
        : "Output is sealed until settlement to protect marketplace integrity."
    };
  }
  return {
    access: "locked",
    mode: "draft",
    viewerRole: role,
    message: role === "client" || role === "evaluator"
      ? "The agent has generated a saved output, but it has not been submitted for review yet."
      : "This saved output is restricted until the agent submits it onchain."
  };
}

export function getDeliverableAccess(input: DeliverableAccessInput): DeliverableAccessResult {
  const role = getDeliverableViewerRole(input);
  const participant = role === "agent_owner" || role === "client" || role === "evaluator" || role === "resolver";
  const selfUseUnlocked = input.isSelfUse === true && input.selfUseExplicit === true && role === "agent_owner";

  if (!input.isSubmittedOnchain) {
    return draftResult(role, input);
  }

  if (input.jobStatus === 6) {
    return {
      access: input.visibility === "public" || participant ? "preview" : "locked",
      mode: input.visibility === "public" || participant ? "disputed" : "locked",
      viewerRole: role,
      message: "This deliverable is currently under dispute. Full report access depends on the final resolution."
    };
  }

  if (input.jobStatus === 3) {
    if (selfUseUnlocked) {
      return {
        access: "full",
        mode: "full",
        viewerRole: role,
        message: "Explicit self-use output unlocked for the registered owner. This run does not count toward public marketplace ratings."
      };
    }
    const access = input.visibility === "public" || participant
      ? "preview"
      : "locked";
    return {
      access,
      mode: access === "preview" ? "preview" : "locked",
      viewerRole: role,
      message: access === "preview"
        ? "Approve this task to unlock the full final report."
        : "This deliverable is restricted until an authorized reviewer opens it."
    };
  }

  if (input.jobStatus === 4) {
    const access = input.visibility === "public" || participant ? "full" : "locked";
    return {
      access,
      mode: access === "full" ? "full" : "locked",
      viewerRole: role,
      message: access === "full"
        ? "Full report unlocked after escrow release."
        : "This completed report is restricted to authorized wallets."
    };
  }

  return {
    access: "locked",
    mode: "locked",
    viewerRole: role,
    message: "This saved output is restricted until its escrow lifecycle permits access."
  };
}

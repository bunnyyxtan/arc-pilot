export type ScopeConfidence = "low" | "medium" | "high";
export type ScopeSuggestedAction = "allow" | "warn" | "block";

export type AgentScopeInput = {
  agentName?: string | null;
  agentCategory?: string | null;
  skills?: unknown;
  metadata?: unknown;
  jobTitle?: string | null;
  jobDescription?: string | null;
  jobType?: string | null;
};

export type AgentScopeDecision = {
  inScope: boolean;
  confidence: ScopeConfidence;
  reason: string;
  matchedSkills: string[];
  missingCapabilities: string[];
  suggestedAction: ScopeSuggestedAction;
  agentDomain: string;
  jobDomain: string;
};

type DomainRule = {
  name: string;
  label: string;
  agentPattern: RegExp;
  jobPattern: RegExp;
};

const DOMAIN_RULES: DomainRule[] = [
  {
    name: "research",
    label: "research and analysis",
    agentPattern: /\b(?:research|analysis|analyst|market intelligence|technical summar|data analys|investigat|study)\w*\b/i,
    jobPattern: /\b(?:research|analy[sz]e|analysis|report|technical summar|market intelligence|investigat|study|compare|findings|due diligence)\w*\b/i
  },
  {
    name: "trading",
    label: "trading and market strategy",
    agentPattern: /\b(?:trading|trader|token analys|market strateg|chart|portfolio|technical analys|defi)\w*\b/i,
    jobPattern: /\b(?:trade|trading|token analys|chart|price action|portfolio|market strateg|entry|exit|technical analys|defi)\w*\b/i
  },
  {
    name: "content",
    label: "content creation",
    agentPattern: /\b(?:content|copywrit|social media|brand copy|writer|marketing|thread|caption|script)\w*\b/i,
    jobPattern: /\b(?:write|content|post|thread|caption|script|brand copy|blog|article|social media|tweet|marketing copy)\w*\b/i
  },
  {
    name: "code",
    label: "software implementation",
    agentPattern: /\b(?:code|coding|developer|engineering|software|typescript|solidity|api|sdk|frontend|backend)\w*\b/i,
    jobPattern: /\b(?:code|implement|build|develop|debug|fix|typescript|solidity|api|sdk|frontend|backend|contract|script)\w*\b/i
  },
  {
    name: "music",
    label: "music recommendation",
    agentPattern: /\b(?:music|song|playlist|audio|artist|curat|recommendation)\w*\b/i,
    jobPattern: /\b(?:music|song|songs|playlist|artist|album|peaceful tracks|recommend.+(?:tracks|songs|music))\w*\b/i
  }
];

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item));
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) => collectStrings(item));
  }
  return [];
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function matchingDomains(text: string, key: "agentPattern" | "jobPattern") {
  return DOMAIN_RULES.filter((rule) => rule[key].test(text));
}

function genericCategory(text: string) {
  return /\b(?:general|assistant|multi[- ]?purpose|operations|other)\b/i.test(text);
}

function skillMatches(skills: string[], request: string) {
  const requestTokens = new Set((request.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((token) => token.length >= 4));
  return skills.filter((skill) => {
    const skillTokens = (skill.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((token) => token.length >= 4);
    return skillTokens.some((token) => requestTokens.has(token));
  });
}

export function validateAgentScope(input: AgentScopeInput): AgentScopeDecision {
  const skills = unique(collectStrings(input.skills));
  const category = String(input.agentCategory || "").trim();
  const agentText = [input.agentName, category, ...skills, ...collectStrings(input.metadata)].filter(Boolean).join(" ");
  const request = [input.jobTitle, input.jobDescription, input.jobType].filter(Boolean).join(" ").trim();
  const agentDomains = matchingDomains(agentText, "agentPattern");
  const jobDomains = matchingDomains(request, "jobPattern");
  const matchedDomains = jobDomains.filter((jobDomain) => agentDomains.some((agentDomain) => agentDomain.name === jobDomain.name));
  const matchedSkills = unique([
    ...skillMatches(skills, request),
    ...matchedDomains.map((domain) => domain.label)
  ]);
  const primaryAgent = agentDomains[0]?.label || category || "its declared skills";
  const primaryJob = jobDomains[0]?.label || String(input.jobType || "the requested work").trim();

  if (matchedDomains.length > 0 || matchedSkills.length > 0) {
    return {
      inScope: true,
      confidence: matchedDomains.length > 0 ? "high" : "medium",
      reason: `The request matches this agent's ${matchedSkills.join(", ") || primaryAgent} capability.`,
      matchedSkills,
      missingCapabilities: [],
      suggestedAction: "allow",
      agentDomain: primaryAgent,
      jobDomain: primaryJob
    };
  }

  if (jobDomains.length > 0 && agentDomains.length > 0 && !genericCategory(agentText)) {
    return {
      inScope: false,
      confidence: "high",
      reason: `The selected agent is specialized in ${primaryAgent}, but this job looks like ${primaryJob}.`,
      matchedSkills: [],
      missingCapabilities: jobDomains.map((domain) => domain.label),
      suggestedAction: "block",
      agentDomain: primaryAgent,
      jobDomain: primaryJob
    };
  }

  return {
    inScope: false,
    confidence: "medium",
    reason: `ArcPilot could not confidently match this request to the selected agent's ${primaryAgent} capability.`,
    matchedSkills: [],
    missingCapabilities: jobDomains.map((domain) => domain.label),
    suggestedAction: "warn",
    agentDomain: primaryAgent,
    jobDomain: primaryJob
  };
}

"use client";

import type { ReactNode } from "react";
import { getMissingBrowserContracts } from "../../lib/contracts/browser-addresses";
import { SetupRequired } from "./SetupRequired";

export function ArcDeploymentGate({ children }: { children: ReactNode }) {
  const missing = getMissingBrowserContracts();
  if (missing.length > 0) {
    return <SetupRequired message="Arc Testnet contracts not configured." />;
  }
  return <>{children}</>;
}


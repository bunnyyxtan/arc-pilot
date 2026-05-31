"use client";

import type { EIP1193Provider } from "viem";

type Eip6963ProviderDetail = {
  info: {
    icon?: string;
    name: string;
    rdns: string;
    uuid?: string;
  };
  provider: EIP1193Provider;
};

declare global {
  interface Window {
    __arcPilotEip6963Providers?: Map<string, Eip6963ProviderDetail>;
  }
}

let initialized = false;

export function requestWalletProviders() {
  if (typeof window === "undefined") return;
  if (!window.__arcPilotEip6963Providers) {
    window.__arcPilotEip6963Providers = new Map();
  }
  if (!initialized) {
    window.addEventListener("eip6963:announceProvider", ((event: CustomEvent<Eip6963ProviderDetail>) => {
      const detail = event.detail;
      if (!detail?.info?.rdns || !detail.provider) return;
      window.__arcPilotEip6963Providers?.set(detail.info.rdns.toLowerCase(), detail);
    }) as EventListener);
    initialized = true;
  }
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function findAnnouncedWalletProvider(match: (rdns: string, name: string) => boolean) {
  if (typeof window === "undefined") return undefined;
  requestWalletProviders();
  for (const detail of window.__arcPilotEip6963Providers?.values() || []) {
    if (match(detail.info.rdns.toLowerCase(), detail.info.name.toLowerCase())) {
      return detail.provider;
    }
  }
  return undefined;
}


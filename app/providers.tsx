"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, http, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors";
import type { EIP1193Provider } from "viem";
import { arcTestnet } from "../lib/chains/arc-testnet";
import { findAnnouncedWalletProvider, requestWalletProviders } from "../lib/wallet/eip6963";

type BrowserProvider = EIP1193Provider & {
  isOkxWallet?: true;
  isOKExWallet?: true;
  isRabby?: true;
  providers?: BrowserProvider[];
};

function findBrowserProvider(windowValue: unknown, predicate: (provider: BrowserProvider) => boolean) {
  const ethereum = (windowValue as { ethereum?: BrowserProvider } | undefined)?.ethereum;
  if (!ethereum) return undefined;
  return [ethereum, ...(ethereum.providers || [])].find(predicate);
}

requestWalletProviders();

const config = createConfig({
  chains: [arcTestnet],
  connectors: [
    injected({ target: "metaMask", shimDisconnect: true }),
    injected({
      target: {
        id: "rabby",
        name: "Rabby Wallet",
        provider: (windowValue) =>
          (findAnnouncedWalletProvider((rdns, name) => rdns.includes("rabby") || name.includes("rabby")) ||
            findBrowserProvider(windowValue, (provider) => Boolean(provider.isRabby))) as any
      },
      shimDisconnect: true
    }),
    injected({
      target: {
        id: "okxWallet",
        name: "OKX Wallet",
        provider: (windowValue) => {
          const scoped = windowValue as {
            okxwallet?: BrowserProvider | { ethereum?: BrowserProvider };
          } | undefined;
          const okx = scoped?.okxwallet;
          const namespacedProvider = okx && "ethereum" in okx ? okx.ethereum : okx;
          return (findAnnouncedWalletProvider((rdns, name) => rdns.includes("okex") || rdns.includes("okx") || name.includes("okx")) ||
            namespacedProvider ||
            findBrowserProvider(windowValue, (provider) => Boolean(provider.isOkxWallet || provider.isOKExWallet))) as any;
        }
      },
      shimDisconnect: true
    }),
    injected({ shimDisconnect: true })
  ],
  multiInjectedProviderDiscovery: true,
  transports: {
    [arcTestnet.id]: http()
  },
  ssr: true
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

import { defineChain } from "viem";

export const ARC_TESTNET_RPC_URL = "https://rpc.testnet.arc.network";
export const ARC_TESTNET_EXPLORER_URL = "https://testnet.arcscan.app";
export const ARC_TESTNET_USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18
  },
  rpcUrls: {
    default: { http: [ARC_TESTNET_RPC_URL] }
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url: ARC_TESTNET_EXPLORER_URL
    }
  },
  testnet: true
});


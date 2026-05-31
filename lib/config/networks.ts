export const NETWORKS = {
  localhost: {
    name: "localhost",
    chainId: 31337,
    rpcEnv: "LOCAL_RPC_URL",
    defaultRpcUrl: "http://127.0.0.1:8545"
  },
  arcTestnet: {
    name: "arc-testnet",
    chainId: 5042002,
    rpcEnv: "ARC_TESTNET_RPC_URL",
    defaultRpcUrl: "https://rpc.testnet.arc.network",
    usdcFallback: "0x3600000000000000000000000000000000000000" as `0x${string}`
  }
} as const;

export type NetworkKey = keyof typeof NETWORKS;

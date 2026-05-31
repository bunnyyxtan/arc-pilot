import { Contract, JsonRpcProvider, Wallet, ethers } from "ethers";
import { getArcTestnetRpcUrlFromEnv, getArcTestnetUsdcAddressFromEnv, requireConfig } from "../lib/config/env";
import { NETWORKS } from "../lib/config/networks";
import { MOCK_USDC_ABI } from "../lib/contracts/abis";
import { loadEnvFiles } from "../lib/contracts/runtime";
import { formatUsdc } from "../lib/format/usdc";

async function main() {
  loadEnvFiles();
  const provider = new JsonRpcProvider(getArcTestnetRpcUrlFromEnv(), NETWORKS.arcTestnet.chainId);
  const wallet = new Wallet(requireConfig("DEPLOYER_PRIVATE_KEY"), provider);
  const deployer = await wallet.getAddress();
  const network = await provider.getNetwork();
  const usdcAddress = getArcTestnetUsdcAddressFromEnv();
  const usdc = new Contract(usdcAddress, MOCK_USDC_ABI, provider);

  const nativeBalance = await provider.getBalance(deployer);
  const erc20Balance = await usdc.balanceOf(deployer);
  const decimals = await usdc.decimals();

  console.log("Arc Testnet faucet check");
  console.log("chainId:", network.chainId.toString());
  console.log("deployer:", deployer);
  console.log("nativeGasBalance:", ethers.formatEther(nativeBalance));
  console.log("erc20USDC:", formatUsdc(erc20Balance));
  console.log("erc20USDCDecimals:", decimals.toString());

  if (nativeBalance === 0n) {
    console.log("Warning: native gas balance is zero. Arc Testnet uses USDC as gas; fund this testnet wallet before transactions.");
  }
  if (erc20Balance === 0n) {
    console.log("Warning: ERC-20 USDC balance is zero. Get Arc Testnet USDC from the Circle faucet before smoke testing.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

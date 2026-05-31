import { execFileSync } from "node:child_process";

function run(label: string, command: string, args: string[]) {
  console.log(`\n${label}`);
  execFileSync(command, args, { stdio: "inherit" });
}

function npmCmd() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

try {
  const npm = npmCmd();
  run("1. Environment check", npm, ["run", "arc:check-env"]);
  run("2. Faucet/balance check", npm, ["run", "arc:testnet:faucet-check"]);
  run("3. Testnet deployment verification", npm, ["run", "arc:verify-testnet"]);
  run("4. Testnet public state", npm, ["run", "arc:testnet:read"]);

  if (process.env.RUN_TESTNET_SMOKE === "true") {
    run("5. Optional testnet smoke", npm, ["run", "arc:testnet:smoke"]);
  } else {
    console.log("\n5. Optional testnet smoke skipped. Set RUN_TESTNET_SMOKE=true to execute it.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

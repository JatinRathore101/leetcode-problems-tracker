import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const topicsPath = join(__dirname, "topics.json");
const url = "http://localhost:3000";

// Log a step banner, e.g. [STEP 1 of 7] ~ "rm -rf .next"
function logStep(step, total, label) {
  console.log(`\n[STEP ${step} of ${total}] ~ "${label}"`);
}

// Run a command to completion, inheriting stdio. Rejects on non-zero exit.
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

// Open a URL in the default browser (new tab), cross-platform.
function openBrowser(target) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", target] : [target];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}

// Start `next dev` and open the browser once the server is listening.
function startDev() {
  const child = spawn("next", ["dev"], {
    cwd: rootDir,
    stdio: ["inherit", "pipe", "inherit"],
    shell: process.platform === "win32",
  });

  let opened = false;
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    if (!opened && /ready|started server|localhost:3000/i.test(chunk.toString())) {
      opened = true;
      openBrowser(url);
    }
  });

  child.on("exit", (code) => process.exit(code ?? 0));
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
}

async function main() {
  const needsSetup = !existsSync(topicsPath);
  const total = needsSetup ? 7 : 2;

  if (needsSetup) {
    console.log(`"${topicsPath}" not found — running full setup chain.`);

    logStep(1, total, "rm -rf .next");
    await run("rm", ["-rf", ".next"]);

    logStep(2, total, "npm install");
    await run("npm", ["install"]);

    logStep(3, total, "node script/scrapper.js");
    await run("node", ["script/scrapper.js"]);

    logStep(4, total, "node script/parser.js");
    await run("node", ["script/parser.js"]);

    logStep(5, total, "node script/transaction.js");
    await run("node", ["script/transaction.js"]);
  } else {
    console.log(`"${topicsPath}" found — skipping setup chain.`);
  }

  logStep(needsSetup ? 6 : 1, total, "next dev");
  logStep(needsSetup ? 7 : 2, total, `open ${url}`);
  startDev();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

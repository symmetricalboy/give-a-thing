import { spawn } from "node:child_process";

function runStep(cmd, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", env: process.env });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with code ${code}`));
    });
  });
}

async function main() {
  if (process.env.DATABASE_URL) {
    console.log("[startup] Running idempotent database & pgvector migrations...");
    await runStep("npx", ["tsx", "scripts/migrate.ts"], "db:migrate");
  }

  if (
    process.env.DATABASE_URL &&
    process.env.APP_ATPROTO_IDENTIFIER &&
    process.env.APP_ATPROTO_PASSWORD
  ) {
    console.log("[startup] Ensuring games.atmosphere.define record is registered...");
    spawn("npx", ["tsx", "scripts/register-atmosphere-game.ts"], {
      stdio: "inherit",
      env: process.env,
    });
  }

  if (
    process.env.DATABASE_URL &&
    process.env.ENABLE_IN_PROCESS_WORKER !== "false"
  ) {
    console.log("[startup] Launching background ATProto Jetstream worker...");
    const worker = spawn("npx", ["tsx", "scripts/worker.ts"], {
      stdio: "inherit",
      env: process.env,
    });
    worker.on("exit", (code) => {
      console.warn(`[startup] Jetstream worker exited (${code}).`);
    });
  }

  console.log("[startup] Starting Next.js standalone server...");
  const server = spawn("node", [".next/standalone/server.js"], {
    stdio: "inherit",
    env: {
      ...process.env,
      HOSTNAME: "0.0.0.0",
      PORT: process.env.PORT || "3000",
    },
  });

  server.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error("[startup] Fatal error:", err);
  process.exit(1);
});

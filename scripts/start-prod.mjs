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

  console.log("[startup] Starting Next.js standalone server (with Jetstream & ATmosphere sync)...");
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

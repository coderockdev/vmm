import { reconcileStuckJobs } from "../src/core/pipeline/reconcile";
import { wake } from "../src/core/pipeline/queue";

const POLL_MS = 20_000;

async function main() {
  const name = process.env.VMM_WORKER_NAME || "hetzner";
  console.log(`[worker] ${name} — un video a la vez. La página no renderiza.`);
  await reconcileStuckJobs();
  wake();
  setInterval(() => {
    wake();
  }, POLL_MS);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

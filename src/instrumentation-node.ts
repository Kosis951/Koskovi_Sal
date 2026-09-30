import { isPushConfigured } from "@/lib/push";
import { runPushChecks } from "@/lib/push-notifications";

// Push notification check (morning summary, changes to today, pending
// cleanup) every minute, so the VPS needs no extra cron job. Does nothing
// without VAPID keys. Loaded from instrumentation.ts on the Node.js server.
if (isPushConfigured()) {
  setTimeout(() => void runPushChecks(), 15_000);
  setInterval(() => void runPushChecks(), 60_000);
}

"use client";

import { useEffect } from "react";

// Registers /sw.js (see public/sw.js). Production only: in development it
// would serve stale build files after hot reloads.
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Without the worker the site still works, just without offline page.
    });
  }, []);

  return null;
}

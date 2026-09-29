import { useEffect, useState } from "react";

// The current time, updated only when the minute changes: everything that
// reads it works at minute precision. Null until mounted, so server and client
// render the same markup.
export function useNow() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    function tick() {
      setNow((current) => {
        const next = new Date();

        return current &&
          Math.floor(current.getTime() / 60000) ===
            Math.floor(next.getTime() / 60000)
          ? current
          : next;
      });
    }

    const timeout = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 30000);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, []);

  return now;
}

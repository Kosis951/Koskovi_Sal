"use client";

import { useCallback, useEffect, useState } from "react";
import { useRefreshHandler } from "@/components/pwa/pull-to-refresh";
import type { Booking } from "@/lib/schedule";

const dateFormatter = new Intl.DateTimeFormat("cs-CZ", {
  day: "numeric",
  month: "numeric",
  weekday: "short",
  year: "numeric",
});

export function formatDateCz(dateKey: string) {
  return dateFormatter.format(new Date(`${dateKey}T12:00:00`));
}

export function getTodayPragueDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Prague",
    year: "numeric",
  }).format(new Date());
}

// Loads JSON from an admin endpoint once on mount; `reload` refetches it.
// `pick` must be stable (defined outside the component).
export function useAdminResource<T>(url: string, pick: (data: unknown) => T, empty: T) {
  const [data, setData] = useState<T>(empty);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const response = await fetch(url, { cache: "no-store" });
      const json = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        setError(json.message ?? "Data se nepodařilo načíst.");
        return;
      }

      setError("");
      setData(pick(json));
    } finally {
      setIsLoading(false);
    }
  }, [pick, url]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void reload();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [reload]);

  // Pull-to-refresh in the installed app.
  useRefreshHandler(reload);

  return { data, error, isLoading, reload };
}

const noBookings: Booking[] = [];

function pickBookings(data: unknown) {
  return (data as { bookings?: Booking[] }).bookings ?? noBookings;
}

export function useAdminBookings() {
  return useAdminResource("/api/bookings", pickBookings, noBookings);
}

export async function sendJson(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    method,
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string };

  return { data, ok: response.ok };
}

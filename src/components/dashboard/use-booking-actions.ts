import { useState } from "react";
import { isRecurringBookingId } from "@/components/booking-dashboard-utils";

type Messages = {
  cleanup: string;
  delete: string;
  time: string;
  title: string;
  trainer: string;
};

const emptyMessages: Messages = {
  cleanup: "",
  delete: "",
  time: "",
  title: "",
  trainer: "",
};

// Edits made from the selected-day panel. Each action reports progress through
// `pendingId`/`messages` and refreshes the calendar once the server confirms.
export function useBookingActions(syncCalendar: () => Promise<void>) {
  const [messages, setMessages] = useState<Messages>(emptyMessages);
  const [pendingId, setPendingId] = useState({
    cleaning: "",
    deleting: "",
    reinstating: "",
    time: "",
    title: "",
    trainer: "",
  });

  function setMessage(key: keyof Messages, message: string) {
    setMessages((current) => ({ ...current, [key]: message }));
  }

  async function run(
    pendingKey: keyof typeof pendingId,
    bookingId: string,
    request: () => Promise<Response>,
  ) {
    setPendingId((current) => ({ ...current, [pendingKey]: bookingId }));

    try {
      const response = await request();
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      return { message: data.message, ok: response.ok };
    } finally {
      setPendingId((current) => ({ ...current, [pendingKey]: "" }));
    }
  }

  async function markCleaned(bookingId: string) {
    setMessage("cleanup", "");

    const result = await run("cleaning", bookingId, () =>
      fetch(`/api/bookings/${bookingId}/clean`, { method: "POST" }),
    );

    if (!result.ok) {
      setMessage("cleanup", result.message ?? "Úklid se nepodařilo potvrdit.");
      return;
    }

    setMessage("cleanup", "Děkujeme, sál je označen jako uklizený.");
    await syncCalendar();
  }

  async function deleteBooking(bookingId: string, title: string) {
    const isRecurring = isRecurringBookingId(bookingId);
    const confirmMessage = isRecurring
      ? `Opravdu zrušit jen tento termín "${title}"? Pravidelné tréninky v dalších týdnech zůstanou.`
      : `Opravdu smazat akci "${title}"?`;

    if (!window.confirm(confirmMessage)) {
      return false;
    }

    setMessage("delete", "");

    const result = await run("deleting", bookingId, () =>
      fetch(`/api/bookings/${bookingId}`, { method: "DELETE" }),
    );

    if (!result.ok) {
      setMessage("delete", result.message ?? "Akci se nepodařilo smazat.");
      return false;
    }

    setMessage(
      "delete",
      isRecurring
        ? "Tento termín pravidelné akce byl zrušen."
        : "Akce byla smazána.",
    );
    await syncCalendar();

    return true;
  }

  async function reinstate(bookingId: string) {
    setMessage("delete", "");

    const result = await run("reinstating", bookingId, () =>
      fetch(`/api/bookings/${bookingId}/reinstate`, { method: "POST" }),
    );

    if (!result.ok) {
      setMessage("delete", result.message ?? "Termín se nepodařilo obnovit.");
      return;
    }

    setMessage("delete", "Pravidelný termín byl obnoven.");
    await syncCalendar();
  }

  async function updateTrainer(bookingId: string, trainer: string) {
    setMessage("trainer", "");

    const result = await run("trainer", bookingId, () =>
      putJson(`/api/bookings/${bookingId}/trainer`, { trainer }),
    );

    if (!result.ok) {
      setMessage("trainer", result.message ?? "Trenéra se nepodařilo uložit.");
      return;
    }

    setMessage(
      "trainer",
      trainer ? "Trenér pro tento termín je uložený." : "Trenér byl odebraný.",
    );
    await syncCalendar();
  }

  // Returns true when saved, so the editor can drop its draft.
  async function updateTitle(bookingId: string, title: string, currentTitle: string) {
    const nextTitle = title.trim();

    if (!nextTitle || nextTitle === currentTitle) {
      return false;
    }

    setMessage("title", "");

    const result = await run("title", bookingId, () =>
      putJson(`/api/bookings/${bookingId}/title`, { title: nextTitle }),
    );

    if (!result.ok) {
      setMessage("title", result.message ?? "Název aktivity se nepodařilo uložit.");
      return false;
    }

    setMessage("title", "Změna aktivity je uložená.");
    await syncCalendar();

    return true;
  }

  // Returns true when saved, so the editor can drop its draft.
  async function updateTime(
    bookingId: string,
    range: { end: string; start: string },
    current: { end: string; start: string },
  ) {
    const start = range.start.trim();
    const end = range.end.trim();

    if (!start || !end || (start === current.start && end === current.end)) {
      return false;
    }

    if (start >= end) {
      setMessage("time", "Konec akce musí být později než začátek.");
      return false;
    }

    setMessage("time", "");

    const result = await run("time", bookingId, () =>
      putJson(`/api/bookings/${bookingId}/time`, { end, start }),
    );

    if (!result.ok) {
      setMessage("time", result.message ?? "Čas akce se nepodařilo uložit.");
      return false;
    }

    setMessage("time", "Čas akce je uložený.");
    await syncCalendar();

    return true;
  }

  return {
    deleteBooking,
    markCleaned,
    messages,
    pendingId,
    reinstate,
    updateTime,
    updateTitle,
    updateTrainer,
  };
}

export type BookingActions = ReturnType<typeof useBookingActions>;

function putJson(url: string, body: unknown) {
  return fetch(url, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
}

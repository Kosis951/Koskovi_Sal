import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionTopics, isPushEndpoint } from "@/lib/push";

export const dynamic = "force-dynamic";

// Which topics this device receives: { endpoint } → { subscribed, topics }.
// POST so the endpoint (a device-specific address) never lands in URLs/logs.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;

  if (!isPushEndpoint(body?.endpoint)) {
    return NextResponse.json({ message: "Neplatné zařízení." }, { status: 400 });
  }

  const topics = getSubscriptionTopics(body.endpoint);

  return NextResponse.json({ subscribed: topics !== null, topics: topics ?? [] });
}

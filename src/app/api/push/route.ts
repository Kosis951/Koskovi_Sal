import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/login-rate-limit";
import {
  deleteSubscription,
  getVapidPublicKey,
  isPushEndpoint,
  parseSubscription,
  parseTopics,
  saveSubscription,
} from "@/lib/push";
import { isRateLimited } from "@/lib/simple-rate-limit";

export const dynamic = "force-dynamic";

// Anyone may subscribe: the notifications only contain what the public
// calendar shows anyway.

export async function GET() {
  return NextResponse.json({ publicKey: getVapidPublicKey() });
}

// Subscribe or change topics: { subscription, topics }.
export async function POST(request: NextRequest) {
  if (!getVapidPublicKey()) {
    return NextResponse.json({ message: "Upozornění nejsou na serveru zapnutá." }, { status: 503 });
  }

  if (isRateLimited(`push:${getClientIp(request.headers)}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ message: "Příliš mnoho pokusů, zkuste to později." }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as {
    subscription?: unknown;
    topics?: unknown;
  } | null;
  const subscription = parseSubscription(body?.subscription);
  const topics = parseTopics(body?.topics);

  if (!subscription) {
    return NextResponse.json({ message: "Neplatné přihlášení k upozorněním." }, { status: 400 });
  }

  if (topics.length === 0) {
    deleteSubscription(subscription.endpoint);
    return NextResponse.json({ subscribed: false, topics });
  }

  if (!saveSubscription(subscription, topics)) {
    return NextResponse.json({ message: "Kapacita upozornění je plná." }, { status: 507 });
  }

  return NextResponse.json({ subscribed: true, topics });
}

// Unsubscribe: { endpoint }.
export async function DELETE(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;

  if (!isPushEndpoint(body?.endpoint)) {
    return NextResponse.json({ message: "Neplatné zařízení." }, { status: 400 });
  }

  deleteSubscription(body.endpoint);

  return NextResponse.json({ subscribed: false });
}

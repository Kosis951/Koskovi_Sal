import { NextRequest, NextResponse } from "next/server";
import { getApnsConfig, isApnsToken } from "@/lib/apns";
import { getClientIp } from "@/lib/login-rate-limit";
import {
  deleteNativeDevice,
  getNativeDeviceTopics,
  parseTopics,
  saveNativeDevice,
  sendToNativeDevice,
} from "@/lib/push";
import { isRateLimited } from "@/lib/simple-rate-limit";

export const dynamic = "force-dynamic";

// Notifications for the native iPhone app. Like web push, anyone may
// subscribe: the notifications only contain what the public calendar shows.
//   POST { platform: "ios", token, topics } – subscribe or change topics
//        (no topics = unsubscribe); add `test: true` for a test notification.
//   PUT { token } – which topics this device receives.
export async function POST(request: NextRequest) {
  if (!getApnsConfig()) {
    return NextResponse.json({ message: "Upozornění pro aplikaci nejsou na serveru zapnutá." }, { status: 503 });
  }

  if (isRateLimited(`push-native:${getClientIp(request.headers)}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ message: "Příliš mnoho pokusů, zkuste to později." }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const token = body?.token;

  if (body?.platform !== "ios" || !isApnsToken(token)) {
    return NextResponse.json({ message: "Neplatné zařízení." }, { status: 400 });
  }

  const topics = parseTopics(body.topics);

  if (topics.length === 0) {
    deleteNativeDevice(token);
    return NextResponse.json({ subscribed: false, topics });
  }

  if (!saveNativeDevice(token, "ios", topics)) {
    return NextResponse.json({ message: "Kapacita upozornění je plná." }, { status: 507 });
  }

  if (body.test === true) {
    const delivered = await sendToNativeDevice(token, {
      body: "Upozornění fungují. Takhle vám dáme vědět, když bude sál obsazený.",
      tag: "test",
      title: "Koškovi sál",
    });

    if (delivered === 0) {
      return NextResponse.json({ message: "Zkušební upozornění se nepodařilo doručit." }, { status: 502 });
    }
  }

  return NextResponse.json({ subscribed: true, topics });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;

  if (!isApnsToken(body?.token)) {
    return NextResponse.json({ message: "Neplatné zařízení." }, { status: 400 });
  }

  const topics = getNativeDeviceTopics(body.token);

  return NextResponse.json({
    available: Boolean(getApnsConfig()),
    subscribed: topics !== null,
    topics: topics ?? [],
  });
}

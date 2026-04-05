import { NextResponse } from "next/server";

import {
  createMessage,
  listConversationMessages,
} from "@/lib/server/synq-store";
import { getViewer } from "@/lib/server/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    conversationId: string;
  }>;
}

export async function GET(_: Request, context: RouteContext) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId } = await context.params;
  try {
    return NextResponse.json(
      await listConversationMessages(viewer, conversationId),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load messages.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId } = await context.params;
  try {
    const payload = await request.json();
    return NextResponse.json(
      await createMessage(viewer, conversationId, payload),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to send message.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

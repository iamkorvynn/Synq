import { NextResponse } from "next/server";

import { markConversationReadForViewer } from "@/lib/server/synq-store";
import { getViewer } from "@/lib/server/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    conversationId: string;
  }>;
}

export async function POST(_: Request, context: RouteContext) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { conversationId } = await context.params;
    return NextResponse.json(
      await markConversationReadForViewer(viewer, conversationId),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to mark conversation as read.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";

import { deleteConversationRoom } from "@/lib/server/synq-store";
import { getViewer } from "@/lib/server/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    conversationId: string;
  }>;
}

export async function DELETE(_: Request, context: RouteContext) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { conversationId } = await context.params;
    return NextResponse.json(
      await deleteConversationRoom(viewer, conversationId),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete room.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

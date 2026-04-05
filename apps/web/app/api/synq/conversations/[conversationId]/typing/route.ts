import { NextResponse } from "next/server";

import { updateTypingIndicator } from "@/lib/server/synq-store";
import { getViewer } from "@/lib/server/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    conversationId: string;
  }>;
}

export async function POST(request: Request, context: RouteContext) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const { conversationId } = await context.params;
    return NextResponse.json(
      await updateTypingIndicator(viewer, conversationId, payload),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update typing state.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

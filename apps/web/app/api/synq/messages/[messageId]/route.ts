import { NextResponse } from "next/server";

import { updateMessage } from "@/lib/server/synq-store";
import { getViewer } from "@/lib/server/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    messageId: string;
  }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const { messageId } = await context.params;
    return NextResponse.json(await updateMessage(viewer, messageId, payload));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update message.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { messageId } = await context.params;
    return NextResponse.json(
      await updateMessage(viewer, messageId, { deleted: true }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete message.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

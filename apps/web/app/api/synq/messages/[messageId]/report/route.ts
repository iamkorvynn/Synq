import { NextResponse } from "next/server";

import { createModerationReport } from "@/lib/server/synq-store";
import { getViewer } from "@/lib/server/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    messageId: string;
  }>;
}

export async function POST(request: Request, context: RouteContext) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const { messageId } = await context.params;
    return NextResponse.json(
      await createModerationReport(viewer, { ...payload, messageId }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to report message.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

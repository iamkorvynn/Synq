import { NextResponse } from "next/server";

import { uploadAttachment } from "@/lib/server/synq-store";
import { getViewer } from "@/lib/server/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    attachmentId: string;
  }>;
}

export async function POST(request: Request, context: RouteContext) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { attachmentId } = await context.params;
  try {
    const payload = await request.json();
    return NextResponse.json(
      await uploadAttachment(viewer, attachmentId, payload),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to upload attachment.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

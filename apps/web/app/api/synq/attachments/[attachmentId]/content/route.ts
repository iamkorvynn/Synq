import { NextResponse } from "next/server";

import { readAttachmentContent } from "@/lib/server/synq-store";
import { getViewer } from "@/lib/server/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    attachmentId: string;
  }>;
}

export async function GET(_: Request, context: RouteContext) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { attachmentId } = await context.params;
  try {
    const payload = await readAttachmentContent(viewer, attachmentId);
    if (!payload) {
      return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read attachment.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

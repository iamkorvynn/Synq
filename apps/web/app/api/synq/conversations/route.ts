import { NextResponse } from "next/server";

import { createConversationRoom } from "@/lib/server/synq-store";
import { getViewer } from "@/lib/server/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    return NextResponse.json(await createConversationRoom(viewer, payload));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create room.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

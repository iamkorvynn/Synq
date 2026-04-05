import { NextResponse } from "next/server";

import { getBootstrapState } from "@/lib/server/synq-store";
import { getViewer } from "@/lib/server/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await getBootstrapState(viewer);
  return NextResponse.json(
    state.devices.filter((device) => device.userId === state.currentUserId),
  );
}

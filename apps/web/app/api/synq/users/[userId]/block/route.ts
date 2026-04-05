import { NextResponse } from "next/server";

import { blockUserForViewer } from "@/lib/server/synq-store";
import { getViewer } from "@/lib/server/viewer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    userId: string;
  }>;
}

export async function POST(_: Request, context: RouteContext) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { userId } = await context.params;
    return NextResponse.json(
      await blockUserForViewer(viewer, { targetUserId: userId }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to block user.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

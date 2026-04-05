import "server-only";

import { auth } from "@/auth";

export async function getViewer() {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) {
    return null;
  }

  return {
    email,
    name: session?.user?.name?.trim() || email.split("@")[0] || "Synq friend",
    image: session?.user?.image ?? null,
  };
}

"use client";

import { useEffect, useState } from "react";

export function PwaBootstrap() {
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const clearSynqCaches = async () => {
      if (!("caches" in window)) {
        return;
      }

      const cacheKeys = await window.caches.keys();
      await Promise.all(
        cacheKeys
          .filter((key) => key.startsWith("synq-shell"))
          .map((key) => window.caches.delete(key)),
      );
    };

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .then(() => clearSynqCaches())
        .finally(() => setRegistered(false));
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", {
        updateViaCache: "none",
      })
      .then(() => setRegistered(true))
      .catch(() => setRegistered(false));
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[0.68rem] uppercase tracking-[0.25em] text-white/55 backdrop-blur-xl">
      {registered ? "PWA ready" : "Installable"}
    </div>
  );
}

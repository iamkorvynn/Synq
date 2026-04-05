import type { TrustedStore } from "./trusted-store";

export function startBackgroundJobs(store: TrustedStore) {
  const timer = setInterval(() => {
    void store.runMaintenance();
  }, 5_000);

  return () => {
    clearInterval(timer);
  };
}

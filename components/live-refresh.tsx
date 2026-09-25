"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Re-renders the server page on a timer so the live standings move without a reload.
export function LiveRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}

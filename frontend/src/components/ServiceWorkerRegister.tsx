"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      window.location.protocol.startsWith("http")
    ) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.debug("PWA ServiceWorker registered with scope:", reg.scope);
          })
          .catch((err) => {
            console.debug("PWA ServiceWorker registration failed:", err);
          });
      });
    }
  }, []);

  return null;
}

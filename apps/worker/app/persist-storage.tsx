"use client";
import { useEffect } from "react";
import { requestPersistentStorage } from "@/lib/db";

/** Asks for persistent storage on every app start (the outbox must survive browser clean-ups). */
export function PersistStorage() {
  useEffect(() => {
    void requestPersistentStorage();
  }, []);
  return null;
}

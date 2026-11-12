"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export function CheckoutCancelledToast() {
  useEffect(() => {
    toast("Checkout cancelled", { description: "No payment was taken. You can keep shopping." });
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  return null;
}

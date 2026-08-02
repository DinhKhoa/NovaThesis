"use client";

import React from "react";
import { RequireRole } from "@/lib/guards";

export default function ThesesLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole roles={["STUDENT", "LECTURER"]}>{children}</RequireRole>;
}

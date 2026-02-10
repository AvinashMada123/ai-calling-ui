"use client";

import { type ReactNode } from "react";
import { SettingsProvider } from "./settings-context";
import { LeadsProvider } from "./leads-context";
import { CallsProvider } from "./calls-context";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <LeadsProvider>
        <CallsProvider>
          <TooltipProvider>
            {children}
            <Toaster richColors position="bottom-right" />
          </TooltipProvider>
        </CallsProvider>
      </LeadsProvider>
    </SettingsProvider>
  );
}

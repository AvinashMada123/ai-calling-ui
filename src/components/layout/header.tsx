"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Separator } from "@/components/ui/separator";

const pageNames: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/leads": "Lead Management",
  "/call-center": "Call Center",
  "/settings": "Settings",
};

export function Header() {
  const pathname = usePathname();
  const pageName = pageNames[pathname] || "Dashboard";

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-16 items-center justify-between border-b border-border/50 bg-background/80 px-6 backdrop-blur-md"
    >
      <div className="flex items-center gap-3">
        <Separator orientation="vertical" className="mr-1 h-4" />
        <motion.h2
          key={pathname}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-lg font-semibold"
        >
          {pageName}
        </motion.h2>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
          <kbd className="rounded bg-background px-1.5 py-0.5 text-[10px] font-mono">
            ⌘K
          </kbd>
          <span>Search</span>
        </div>
      </div>
    </motion.header>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getBotConfigs } from "@/lib/firestore/bot-config";
import type { BotConfig } from "@/types/bot-config";

interface BotConfigSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export function BotConfigSelector({ value, onChange }: BotConfigSelectorProps) {
  const { orgId } = useAuth();
  const [configs, setConfigs] = useState<BotConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    async function load() {
      try {
        const data = await getBotConfigs(orgId!);
        if (cancelled) return;
        setConfigs(data);
        // Auto-select active config if no value is set
        if (!value) {
          const active = data.find((c) => c.isActive);
          if (active) onChange(active.id);
        }
      } catch {
        // silent failure — configs list stays empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="space-y-2">
        <Label>Bot Config</Label>
        <div className="flex items-center gap-2 text-sm text-muted-foreground h-10 px-3 border rounded-md">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading configs...
        </div>
      </div>
    );
  }

  if (configs.length === 0) {
    return (
      <div className="space-y-2">
        <Label>Bot Config</Label>
        <div className="text-sm text-muted-foreground h-10 px-3 border rounded-md flex items-center">
          No bot configs found — using defaults
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Bot Config</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a bot config" />
        </SelectTrigger>
        <SelectContent>
          {configs.map((config) => (
            <SelectItem key={config.id} value={config.id}>
              <div className="flex items-center gap-2">
                <span>{config.name}</span>
                {config.isActive && (
                  <Badge variant="secondary" className="text-xs">
                    Active
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {config.questions?.length ?? 0}q
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

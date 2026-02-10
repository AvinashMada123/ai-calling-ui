"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Phone,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Pause,
  Play,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { useSettings } from "@/hooks/use-settings";
import { useCalls } from "@/hooks/use-calls";
import { useLeads } from "@/hooks/use-leads";
import { formatPhoneNumber } from "@/lib/utils";
import type { Lead } from "@/types/lead";
import type { CallRequest } from "@/types/call";

type LeadCallStatus = "pending" | "calling" | "success" | "failed";

interface BulkCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leads: Lead[];
  onComplete: () => void;
}

const MAX_CONCURRENT = 5;

export function BulkCallDialog({
  open,
  onOpenChange,
  leads,
  onComplete,
}: BulkCallDialogProps) {
  const { settings } = useSettings();
  const { initiateCall } = useCalls();
  const { incrementCallCount } = useLeads();

  const [statuses, setStatuses] = useState<Record<string, LeadCallStatus>>({});
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const abortRef = useRef(false);

  // Reset state when dialog opens with new leads
  useEffect(() => {
    if (open) {
      const initial: Record<string, LeadCallStatus> = {};
      leads.forEach((l) => (initial[l.id] = "pending"));
      setStatuses(initial);
      setStarted(false);
      setPaused(false);
      pausedRef.current = false;
      abortRef.current = false;
    }
  }, [open, leads]);

  const completed = Object.values(statuses).filter(
    (s) => s === "success" || s === "failed"
  ).length;
  const succeeded = Object.values(statuses).filter(
    (s) => s === "success"
  ).length;
  const failed = Object.values(statuses).filter(
    (s) => s === "failed"
  ).length;
  const progress = leads.length > 0 ? (completed / leads.length) * 100 : 0;
  const isFinished = completed === leads.length && started;

  const callLead = useCallback(
    async (lead: Lead) => {
      setStatuses((prev) => ({ ...prev, [lead.id]: "calling" }));

      const request: CallRequest = {
        phoneNumber: lead.phoneNumber,
        contactName: lead.contactName,
        clientName: settings.defaults.clientName,
        agentName: settings.defaults.agentName,
        companyName: lead.company || settings.defaults.companyName,
        eventName: settings.defaults.eventName,
        eventHost: settings.defaults.eventHost,
        voice: settings.defaults.voice,
        location: lead.location || settings.defaults.location,
      };

      try {
        await initiateCall(request, lead.id);
        incrementCallCount(lead.id);
        setStatuses((prev) => ({ ...prev, [lead.id]: "success" }));
      } catch {
        setStatuses((prev) => ({ ...prev, [lead.id]: "failed" }));
      }
    },
    [settings.defaults, initiateCall, incrementCallCount]
  );

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const waitWhilePaused = useCallback(async () => {
    while (pausedRef.current && !abortRef.current) {
      await sleep(300);
    }
  }, []);

  const startCalling = useCallback(async () => {
    setStarted(true);
    const queue = [...leads];
    let idx = 0;

    while (idx < queue.length && !abortRef.current) {
      await waitWhilePaused();
      if (abortRef.current) break;

      // Launch a batch of up to MAX_CONCURRENT
      const batch = queue.slice(idx, idx + MAX_CONCURRENT);
      await Promise.all(batch.map((lead) => callLead(lead)));

      idx += batch.length;

      // Small delay between batches
      if (idx < queue.length) {
        await sleep(1000);
      }
    }
  }, [leads, callLead, waitWhilePaused]);

  const handleStart = () => {
    startCalling();
  };

  const handlePauseResume = () => {
    const next = !paused;
    setPaused(next);
    pausedRef.current = next;
  };

  const handleClose = () => {
    abortRef.current = true;
    onOpenChange(false);
    if (isFinished) onComplete();
  };

  const statusIcon = (status: LeadCallStatus) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      case "calling":
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Bulk Call — {leads.length} Lead{leads.length !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            {!started
              ? `Ready to call ${leads.length} selected leads (${MAX_CONCURRENT} at a time)`
              : isFinished
                ? `Done — ${succeeded} succeeded, ${failed} failed`
                : `Calling... ${completed}/${leads.length} complete`}
          </DialogDescription>
        </DialogHeader>

        {started && (
          <div className="space-y-1">
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {succeeded} succeeded{failed > 0 ? `, ${failed} failed` : ""}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
          </div>
        )}

        <ScrollArea className="max-h-[300px]">
          <div className="space-y-1">
            {leads.map((lead) => (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm"
              >
                {statusIcon(statuses[lead.id] || "pending")}
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{lead.contactName}</span>
                  <span className="text-muted-foreground ml-2">
                    {formatPhoneNumber(lead.phoneNumber)}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex gap-2 justify-end">
          {!started && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleStart}>
                <Phone className="mr-2 h-4 w-4" />
                Start Calling
              </Button>
            </>
          )}

          {started && !isFinished && (
            <Button variant="outline" onClick={handlePauseResume}>
              {paused ? (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="mr-2 h-4 w-4" />
                  Pause
                </>
              )}
            </Button>
          )}

          {isFinished && (
            <Button onClick={handleClose}>
              Done
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

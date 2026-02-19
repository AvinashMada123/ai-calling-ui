"use client";

import { useState, useCallback, useEffect } from "react";
import { Upload, Plus, RefreshCw, Settings } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LeadsToolbar } from "@/components/leads/leads-toolbar";
import { LeadsTable } from "@/components/leads/leads-table";
import { LeadsPagination } from "@/components/leads/leads-pagination";
import { LeadUploadModal } from "@/components/leads/lead-upload-modal";
import { AddLeadDialog } from "@/components/leads/add-lead-dialog";
import { useLeads } from "@/hooks/use-leads";
import { useSettings } from "@/hooks/use-settings";
import { useAuthContext } from "@/context/auth-context";
import { toast } from "sonner";

export default function LeadsPage() {
  const { totalLeads, mergeGhlLeads } = useLeads();
  const { settings, updateSettings } = useSettings();
  const { user } = useAuthContext();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [ghlTags, setGhlTags] = useState<string[]>([]);
  const [selectedGhlTag, setSelectedGhlTag] = useState("all");
  const [loadingTags, setLoadingTags] = useState(false);

  const ghlConfigured = !!(settings.ghlApiKey && settings.ghlLocationId);
  const ghlSyncEnabled = settings.ghlSyncEnabled ?? false;

  const handleToggleGhlSync = (checked: boolean) => {
    updateSettings({ ghlSyncEnabled: checked });
  };

  // Fetch GHL tags when sync is enabled and configured
  useEffect(() => {
    if (!ghlSyncEnabled || !ghlConfigured || !user) return;

    let cancelled = false;
    const fetchTags = async () => {
      setLoadingTags(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/data/ghl-contacts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: "fetchTags" }),
        });
        const data = await res.json();
        if (!cancelled && data.tags) {
          setGhlTags(data.tags);
        }
      } catch (err) {
        console.error("Failed to fetch GHL tags:", err);
      } finally {
        if (!cancelled) setLoadingTags(false);
      }
    };

    fetchTags();
    return () => { cancelled = true; };
  }, [ghlSyncEnabled, ghlConfigured, user]);

  const handleSync = useCallback(async () => {
    if (!user) return;
    setSyncing(true);
    const toastId = toast.loading("Connecting to GoHighLevel...");
    try {
      const token = await user.getIdToken();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180000); // 3 min timeout

      toast.loading("Fetching contacts from GoHighLevel... This may take a minute.", { id: toastId });

      const res = await fetch("/api/data/ghl-contacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "sync",
          ...(selectedGhlTag !== "all" && { tag: selectedGhlTag }),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to sync GHL contacts", { id: toastId });
        return;
      }

      // Update last sync time in settings
      updateSettings({ ghlLastSyncAt: data.ghlLastSyncAt });

      toast.loading("Refreshing leads list...", { id: toastId });

      // Reload leads from server to get the synced data
      const leadsRes = await fetch("/api/data/leads", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const leadsData = await leadsRes.json();
      if (leadsData.leads) {
        mergeGhlLeads(
          leadsData.leads.filter(
            (l: { source: string }) => l.source === "ghl"
          )
        );
      }

      toast.success(`Synced ${data.synced} contacts from GoHighLevel`, { id: toastId });
    } catch (error) {
      console.error("GHL sync error:", error);
      const message = error instanceof Error && error.name === "AbortError"
        ? "Sync timed out — too many contacts. Check server logs."
        : "Failed to sync GHL contacts";
      toast.error(message, { id: toastId });
    } finally {
      setSyncing(false);
    }
  }, [user, updateSettings, mergeGhlLeads, selectedGhlTag]);

  const formatLastSync = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Lead Management
          </h1>
          <p className="text-muted-foreground">{totalLeads} total leads</p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => setUploadOpen(true)}
            variant="outline"
          >
            <Upload className="mr-2 h-4 w-4" /> Import Leads
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Lead
          </Button>
        </div>
      </div>

      {/* GHL Sync Section */}
      <div className="flex items-center gap-4 rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <Switch
            id="ghl-sync"
            checked={ghlSyncEnabled}
            onCheckedChange={handleToggleGhlSync}
          />
          <Label htmlFor="ghl-sync" className="font-medium">
            Sync from GoHighLevel
          </Label>
        </div>

        {ghlSyncEnabled && (
          <div className="flex items-center gap-3">
            {ghlConfigured ? (
              <>
                <Select
                  value={selectedGhlTag}
                  onValueChange={setSelectedGhlTag}
                  disabled={syncing || loadingTags}
                >
                  <SelectTrigger className="w-[180px] h-9">
                    <SelectValue placeholder={loadingTags ? "Loading tags..." : "Select tag"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Contacts</SelectItem>
                    {ghlTags.map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSync}
                  disabled={syncing}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`}
                  />
                  {syncing ? "Syncing..." : "Sync Now"}
                </Button>
                {settings.ghlLastSyncAt && (
                  <span className="text-sm text-muted-foreground">
                    Last synced: {formatLastSync(settings.ghlLastSyncAt)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-muted-foreground">
                Configure GHL API key in{" "}
                <Link
                  href="/settings"
                  className="text-primary underline underline-offset-4"
                >
                  <Settings className="mr-1 inline h-3 w-3" />
                  Settings
                </Link>
              </span>
            )}
          </div>
        )}
      </div>

      <LeadsToolbar />
      <LeadsTable />
      <LeadsPagination />

      <LeadUploadModal open={uploadOpen} onOpenChange={setUploadOpen} />
      <AddLeadDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

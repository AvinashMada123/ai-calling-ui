"use client";

import { useState, useEffect, useCallback } from "react";
import { Upload, Plus, RefreshCw, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeadsToolbar } from "@/components/leads/leads-toolbar";
import { LeadsTable } from "@/components/leads/leads-table";
import { LeadsPagination } from "@/components/leads/leads-pagination";
import { LeadUploadModal } from "@/components/leads/lead-upload-modal";
import { AddLeadDialog } from "@/components/leads/add-lead-dialog";
import { useLeads } from "@/hooks/use-leads";
import { useSettings } from "@/hooks/use-settings";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export default function LeadsPage() {
  const { totalLeads, refreshLeads } = useLeads();
  const { settings, updateSettings } = useSettings();
  const { user } = useAuth();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // GHL Sync state
  const [syncing, setSyncing] = useState(false);
  const [ghlTags, setGhlTags] = useState<string[]>([]);
  const [selectedGhlTag, setSelectedGhlTag] = useState("all");
  const [loadingTags, setLoadingTags] = useState(false);
  const [totalSynced, setTotalSynced] = useState(0);
  const [totalInGHL, setTotalInGHL] = useState<number | null>(null);

  const ghlConfigured = !!(settings.ghlApiKey && settings.ghlLocationId);
  const ghlSyncEnabled = settings.ghlSyncEnabled ?? false;

  const handleToggleGhlSync = async (checked: boolean) => {
    await updateSettings({ ghlSyncEnabled: checked });
  };

  // Fetch GHL tags when sync is enabled
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
          const tagNames = data.tags
            .map((t: { name?: string } | string) =>
              typeof t === "string" ? t : t.name || ""
            )
            .filter(Boolean);
          setGhlTags(tagNames);
        }
      } catch (err) {
        console.error("Failed to fetch GHL tags:", err);
      } finally {
        if (!cancelled) setLoadingTags(false);
      }
    };

    fetchTags();
    return () => {
      cancelled = true;
    };
  }, [ghlSyncEnabled, ghlConfigured, user]);

  // GHL sync handler
  const handleSync = useCallback(async () => {
    if (!user) return;
    setSyncing(true);
    const toastId = toast.loading("Fetching contacts from GoHighLevel...");
    try {
      const token = await user.getIdToken();

      const res = await fetch("/api/data/ghl-contacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "sync",
          ...(selectedGhlTag !== "all" && { tags: [selectedGhlTag] }),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to sync GHL contacts", {
          id: toastId,
        });
        return;
      }

      setTotalSynced(data.totalFetched || data.created + data.updated);
      if (data.totalFetched) setTotalInGHL(data.totalFetched);

      updateSettings({ ghlLastSyncAt: new Date().toISOString() });
      refreshLeads();

      toast.success(
        `Synced ${data.created} new + ${data.updated} updated contacts`,
        { id: toastId }
      );
    } catch (error) {
      console.error("GHL sync error:", error);
      toast.error("Failed to sync GHL contacts", { id: toastId });
    } finally {
      setSyncing(false);
    }
  }, [user, updateSettings, refreshLeads, selectedGhlTag]);

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
          <Button onClick={() => setUploadOpen(true)} variant="outline">
            <Upload className="mr-2 h-4 w-4" /> Import Leads
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Lead
          </Button>
        </div>
      </div>

      {/* GHL Sync Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link2 className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">GoHighLevel Sync</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="ghl-sync-toggle" className="text-sm text-muted-foreground">
                {ghlSyncEnabled ? "Enabled" : "Disabled"}
              </Label>
              <Switch
                id="ghl-sync-toggle"
                checked={ghlSyncEnabled}
                onCheckedChange={handleToggleGhlSync}
                disabled={!ghlConfigured}
              />
            </div>
          </div>
        </CardHeader>

        {!ghlConfigured && (
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">
              Configure your GHL API Key and Location ID in{" "}
              <a href="/settings" className="text-primary underline">
                Settings
              </a>{" "}
              to enable contact sync.
            </p>
          </CardContent>
        )}

        {ghlConfigured && ghlSyncEnabled && (
          <CardContent className="pt-0 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Select
                value={selectedGhlTag}
                onValueChange={setSelectedGhlTag}
                disabled={loadingTags}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue
                    placeholder={loadingTags ? "Loading tags..." : "Filter by tag"}
                  />
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
                onClick={() => handleSync()}
                disabled={syncing}
                size="sm"
              >
                <RefreshCw
                  className={`mr-1.5 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
                />
                {syncing ? "Syncing..." : "Sync Contacts"}
              </Button>

              {settings.ghlLastSyncAt && (
                <span className="text-xs text-muted-foreground">
                  Last sync:{" "}
                  {new Date(settings.ghlLastSyncAt).toLocaleString()}
                </span>
              )}
            </div>

            {totalInGHL !== null && totalSynced > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{totalSynced} contacts synced</span>
                  <span>{totalInGHL} total in GHL</span>
                </div>
                <Progress
                  value={Math.min(
                    100,
                    Math.round((totalSynced / totalInGHL) * 100)
                  )}
                  className="h-1.5"
                />
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <LeadsToolbar />
      <LeadsTable />
      <LeadsPagination />

      <LeadUploadModal open={uploadOpen} onOpenChange={setUploadOpen} />
      <AddLeadDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

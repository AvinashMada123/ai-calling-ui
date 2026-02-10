"use client";

import { useState } from "react";
import { Upload, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeadsToolbar } from "@/components/leads/leads-toolbar";
import { LeadsTable } from "@/components/leads/leads-table";
import { LeadsPagination } from "@/components/leads/leads-pagination";
import { LeadUploadModal } from "@/components/leads/lead-upload-modal";
import { AddLeadDialog } from "@/components/leads/add-lead-dialog";
import { useLeads } from "@/hooks/use-leads";

export default function LeadsPage() {
  const { totalLeads } = useLeads();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

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

      <LeadsToolbar />
      <LeadsTable />
      <LeadsPagination />

      <LeadUploadModal open={uploadOpen} onOpenChange={setUploadOpen} />
      <AddLeadDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

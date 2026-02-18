"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { MoreHorizontal, Phone, Trash2, Users } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LeadStatusBadge } from "@/components/shared/status-badge";
import { QualificationBadge } from "@/components/shared/qualification-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { useLeads } from "@/hooks/use-leads";
import { formatPhoneNumber } from "@/lib/utils";

export function LeadsTable() {
  const {
    paginatedLeads,
    selectedIds,
    toggleSelect,
    selectAll,
    deselectAll,
    deleteLeads,
  } = useLeads();

  const allSelected =
    paginatedLeads.length > 0 &&
    paginatedLeads.every((lead) => selectedIds.includes(lead.id));

  const handleHeaderCheckboxChange = () => {
    if (allSelected) {
      deselectAll();
    } else {
      selectAll();
    }
  };

  if (paginatedLeads.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-12 w-12" />}
        title="No leads yet"
        description="Import a CSV file or add leads manually"
      />
    );
  }

  const sourceLabel = (source: string) => {
    switch (source) {
      case "csv":
        return "CSV";
      case "excel":
        return "Excel";
      case "manual":
        return "Manual";
      case "ghl":
        return "GHL";
      default:
        return source;
    }
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleHeaderCheckboxChange}
                className="h-4 w-4 rounded border-gray-300 accent-violet-600"
              />
            </TableHead>
            <TableHead>Contact Name</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Qualification</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Calls</TableHead>
            <TableHead className="w-[70px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedLeads.map((lead, index) => (
            <motion.tr
              key={lead.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.03 }}
              className="hover:bg-muted/50 border-b transition-colors"
            >
              <TableCell>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(lead.id)}
                  onChange={() => toggleSelect(lead.id)}
                  className="h-4 w-4 rounded border-gray-300 accent-violet-600"
                />
              </TableCell>
              <TableCell className="font-medium">
                {lead.contactName}
              </TableCell>
              <TableCell>{formatPhoneNumber(lead.phoneNumber)}</TableCell>
              <TableCell className="text-muted-foreground">
                {lead.email || "-"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {lead.company || "-"}
              </TableCell>
              <TableCell>
                <LeadStatusBadge status={lead.status} />
              </TableCell>
              <TableCell>
                {lead.qualificationLevel ? (
                  <QualificationBadge level={lead.qualificationLevel} size="sm" />
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="text-xs">
                  {sourceLabel(lead.source)}
                </Badge>
              </TableCell>
              <TableCell>
                {lead.tags && lead.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {lead.tags.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {lead.tags.length > 2 && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        +{lead.tags.length - 2}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell>{lead.callCount}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-xs">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link
                        href={`/call-center?phone=${encodeURIComponent(lead.phoneNumber)}&name=${encodeURIComponent(lead.contactName)}&leadId=${lead.id}`}
                      >
                        <Phone className="mr-2 h-4 w-4" />
                        Call
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => deleteLeads([lead.id])}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </motion.tr>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

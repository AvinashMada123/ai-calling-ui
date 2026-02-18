"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  DollarSign,
  Receipt,
  TrendingUp,
  Loader2,
  CreditCard,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const COST_PER_MINUTE = 0.10;

const planColors: Record<string, string> = {
  free: "bg-zinc-500/15 text-zinc-600 border-zinc-500/20",
  starter: "bg-blue-500/15 text-blue-600 border-blue-500/20",
  pro: "bg-violet-500/15 text-violet-600 border-violet-500/20",
  enterprise: "bg-amber-500/15 text-amber-600 border-amber-500/20",
};

interface BillingRow {
  orgId: string;
  orgName: string;
  plan: string;
  minutesUsed: number;
  estimatedCost: number;
}

export default function AdminBillingPage() {
  const { isSuperAdmin, user } = useAuth();
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const totalRevenue = rows.reduce((sum, r) => sum + r.estimatedCost, 0);
  const totalMinutes = rows.reduce((sum, r) => sum + r.minutesUsed, 0);

  useEffect(() => {
    if (!isSuperAdmin || !user) return;
    loadBilling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, user]);

  async function loadBilling() {
    try {
      setLoading(true);
      
      const idToken = await user!.getIdToken();
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      try {
        const response = await fetch("/api/admin/billing", {
          headers: { Authorization: `Bearer ${idToken}` },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Failed to load billing data: ${response.statusText}`);
        }

        const data = await response.json();
        setRows(data.rows || []);
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          toast.error("Request timed out. Please try again.");
        } else {
          throw fetchError;
        }
      }
    } catch (err) {
      console.error("[Billing Page] Error:", err);
      toast.error("Failed to load billing data");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing Overview</h1>
        <p className="text-muted-foreground">
          Revenue estimates and usage billing for the current month
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Card>
                <CardContent className="flex items-center gap-4 pt-0">
                  <div className="rounded-lg bg-emerald-500/10 p-2.5">
                    <DollarSign className="size-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Estimated Revenue</p>
                    <p className="text-2xl font-bold">
                      ${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
            >
              <Card>
                <CardContent className="flex items-center gap-4 pt-0">
                  <div className="rounded-lg bg-blue-500/10 p-2.5">
                    <TrendingUp className="size-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Minutes Billed</p>
                    <p className="text-2xl font-bold">
                      {totalMinutes.toLocaleString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 }}
            >
              <Card>
                <CardContent className="flex items-center gap-4 pt-0">
                  <div className="rounded-lg bg-violet-500/10 p-2.5">
                    <CreditCard className="size-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Rate per Minute</p>
                    <p className="text-2xl font-bold">${COST_PER_MINUTE.toFixed(2)}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Billing Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Receipt className="size-5 text-muted-foreground" />
                  <CardTitle>Billing by Organization</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {rows.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">
                    No billing data for this month
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Organization</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead className="text-right">Minutes Used</TableHead>
                        <TableHead className="text-right">Estimated Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.orgId}>
                          <TableCell className="font-medium">{row.orgName}</TableCell>
                          <TableCell>
                            <Badge className={planColors[row.plan] ?? planColors.free}>
                              {row.plan.charAt(0).toUpperCase() + row.plan.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {row.minutesUsed.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ${row.estimatedCost.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}
    </div>
  );
}

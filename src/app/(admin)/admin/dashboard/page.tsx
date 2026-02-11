"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  Users,
  Phone,
  Clock,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { getAllOrganizations } from "@/lib/firestore/organizations";
import { getAllOrgsUsage } from "@/lib/firestore/usage";
import type { Organization } from "@/types/user";
import type { UsageRecord } from "@/types/billing";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PlatformStats {
  totalOrgs: number;
  totalUsers: number;
  totalCallsThisMonth: number;
  totalMinutesThisMonth: number;
}

export default function AdminDashboardPage() {
  const { isSuperAdmin } = useAuth();
  const [stats, setStats] = useState<PlatformStats>({
    totalOrgs: 0,
    totalUsers: 0,
    totalCallsThisMonth: 0,
    totalMinutesThisMonth: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSuperAdmin) return;
    loadStats();
  }, [isSuperAdmin]);

  async function loadStats() {
    try {
      setLoading(true);

      const [orgs, usageRecords] = await Promise.all([
        getAllOrganizations(),
        getAllOrgsUsage(),
      ]);

      const totalCalls = usageRecords.reduce((sum, u) => sum + (u.totalCalls ?? 0), 0);
      const totalMinutes = usageRecords.reduce((sum, u) => sum + (u.totalMinutes ?? 0), 0);

      setStats({
        totalOrgs: orgs.length,
        totalUsers: 0, // Will be populated if a global user count endpoint is available
        totalCallsThisMonth: totalCalls,
        totalMinutesThisMonth: Math.round(totalMinutes * 100) / 100,
      });
    } catch (err) {
      toast.error("Failed to load platform stats");
    } finally {
      setLoading(false);
    }
  }

  const cards = [
    {
      title: "Total Organizations",
      value: stats.totalOrgs,
      icon: Building2,
      color: "text-blue-600",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Total Users",
      value: stats.totalUsers || "--",
      icon: Users,
      color: "text-violet-600",
      bgColor: "bg-violet-500/10",
    },
    {
      title: "Calls This Month",
      value: stats.totalCallsThisMonth.toLocaleString(),
      icon: Phone,
      color: "text-emerald-600",
      bgColor: "bg-emerald-500/10",
    },
    {
      title: "Minutes This Month",
      value: stats.totalMinutesThisMonth.toLocaleString(),
      icon: Clock,
      color: "text-amber-600",
      bgColor: "bg-amber-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Platform-wide overview and statistics
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
              >
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        {card.title}
                      </CardTitle>
                      <div className={`rounded-lg p-2 ${card.bgColor}`}>
                        <Icon className={`size-4 ${card.color}`} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{card.value}</div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  Users,
  Phone,
  Clock,
  Loader2,
  Shield,
  ShieldCheck,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { getOrganization } from "@/lib/firestore/organizations";
import { getMonthlyUsage } from "@/lib/firestore/usage";
import { getOrgUsers } from "@/lib/firestore/users";
import type { Organization, UserProfile } from "@/types/user";
import type { UsageRecord } from "@/types/billing";

import { Button } from "@/components/ui/button";
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

const planColors: Record<string, string> = {
  free: "bg-zinc-500/15 text-zinc-600 border-zinc-500/20",
  starter: "bg-blue-500/15 text-blue-600 border-blue-500/20",
  pro: "bg-violet-500/15 text-violet-600 border-violet-500/20",
  enterprise: "bg-amber-500/15 text-amber-600 border-amber-500/20",
};

const statusColors: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 border-emerald-500/20",
  suspended: "bg-red-500/15 text-red-600 border-red-500/20",
  trial: "bg-amber-500/15 text-amber-600 border-amber-500/20",
};

const roleConfig: Record<string, { label: string; icon: typeof Shield; color: string }> = {
  super_admin: {
    label: "Super Admin",
    icon: ShieldCheck,
    color: "bg-purple-500/15 text-purple-600 border-purple-500/20",
  },
  client_admin: {
    label: "Admin",
    icon: Shield,
    color: "bg-blue-500/15 text-blue-600 border-blue-500/20",
  },
  client_user: {
    label: "User",
    icon: User,
    color: "bg-zinc-500/15 text-zinc-600 border-zinc-500/20",
  },
};

export default function AdminClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isSuperAdmin } = useAuth();
  const targetOrgId = params.orgId as string;

  const [org, setOrg] = useState<Organization | null>(null);
  const [usage, setUsage] = useState<UsageRecord | null>(null);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [orgData, usageData, usersData] = await Promise.all([
        getOrganization(targetOrgId),
        getMonthlyUsage(targetOrgId),
        getOrgUsers(targetOrgId),
      ]);

      if (!orgData) {
        toast.error("Organization not found");
        router.push("/admin/clients");
        return;
      }

      setOrg(orgData);
      setUsage(usageData);
      setMembers(usersData);
    } catch (err) {
      toast.error("Failed to load organization details");
    } finally {
      setLoading(false);
    }
  }, [targetOrgId, router]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    loadData();
  }, [isSuperAdmin, loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!org) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/admin/clients")}>
          <ArrowLeft className="size-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{org.name}</h1>
          <p className="text-muted-foreground">Organization details and usage</p>
        </div>
      </div>

      {/* Org Info Card */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="size-5 text-muted-foreground" />
              <CardTitle>Organization Info</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{org.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Plan</p>
                <Badge className={planColors[org.plan] ?? planColors.free}>
                  {org.plan.charAt(0).toUpperCase() + org.plan.slice(1)}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge className={statusColors[org.status] ?? statusColors.active}>
                  {org.status.charAt(0).toUpperCase() + org.status.slice(1)}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <p className="font-medium">
                  {new Date(org.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Usage Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Usage This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-500/10 p-2">
                  <Phone className="size-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Calls</p>
                  <p className="text-2xl font-bold">{usage?.totalCalls ?? 0}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-500/10 p-2">
                  <Clock className="size-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Minutes</p>
                  <p className="text-2xl font-bold">
                    {Math.round((usage?.totalMinutes ?? 0) * 100) / 100}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Completed Calls</p>
                <p className="text-2xl font-bold">{usage?.completedCalls ?? 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Failed Calls</p>
                <p className="text-2xl font-bold">{usage?.failedCalls ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Team Members */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="size-5 text-muted-foreground" />
              <CardTitle>Team Members ({members.length})</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No team members</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Login</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => {
                    const role = roleConfig[member.role] ?? roleConfig.client_user;
                    const RoleIcon = role.icon;
                    return (
                      <TableRow key={member.uid}>
                        <TableCell className="font-medium">
                          {member.displayName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {member.email}
                        </TableCell>
                        <TableCell>
                          <Badge className={role.color}>
                            <RoleIcon className="size-3" />
                            {role.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              member.status === "active"
                                ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/20"
                                : member.status === "disabled"
                                ? "bg-red-500/15 text-red-600 border-red-500/20"
                                : "bg-amber-500/15 text-amber-600 border-amber-500/20"
                            }
                          >
                            {member.status === "pending_invite"
                              ? "Pending"
                              : member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {member.lastLoginAt
                            ? new Date(member.lastLoginAt).toLocaleDateString()
                            : "Never"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

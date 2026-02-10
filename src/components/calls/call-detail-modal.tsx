"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Clock,
  MessageSquare,
  BarChart3,
  FileText,
  Gauge,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Activity,
  Zap,
  Timer,
  Target,
} from "lucide-react";
import type { CallRecord } from "@/types/call";
import { CallStatusBadge } from "@/components/shared/status-badge";
import { QualificationBadge } from "@/components/shared/qualification-badge";
import { formatPhoneNumber, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface CallDetailModalProps {
  call: CallRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function InterestBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    High: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    Low: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", colors[level] || colors.Medium)}>
      {level} Interest
    </Badge>
  );
}

function MetricCard({ label, value, unit, icon: Icon }: { label: string; value: string | number; unit?: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">
          {value}{unit && <span className="text-xs text-muted-foreground ml-0.5">{unit}</span>}
        </p>
      </div>
    </div>
  );
}

type Tab = "summary" | "transcript" | "qa" | "metrics" | "qualification";

export function CallDetailModal({ call, open, onOpenChange }: CallDetailModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [expandedQA, setExpandedQA] = useState<string | null>(null);

  if (!call) return null;

  const data = call.endedData;
  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "summary", label: "Summary", icon: FileText },
    { id: "qualification", label: "Qualification", icon: Target },
    { id: "transcript", label: "Transcript", icon: MessageSquare },
    { id: "qa", label: "Q&A", icon: BarChart3 },
    { id: "metrics", label: "Metrics", icon: Gauge },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl">{call.request.contactName}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {formatPhoneNumber(call.request.phoneNumber)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {data?.qualification && (
                <QualificationBadge
                  level={data.qualification.level}
                  confidence={data.qualification.confidence}
                />
              )}
              {data && <InterestBadge level={data.interest_level} />}
              <CallStatusBadge status={call.status} />
            </div>
          </div>

          {data && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-3 gap-3 mt-4"
            >
              <MetricCard icon={Clock} label="Duration" value={data.duration_seconds} unit="s" />
              <MetricCard icon={Activity} label="Completion" value={`${Math.round(data.completion_rate * 100)}%`} />
              <MetricCard icon={MessageSquare} label="Questions" value={`${data.questions_completed}/${data.total_questions}`} />
            </motion.div>
          )}
        </DialogHeader>

        {data ? (
          <>
            <div className="flex border-b px-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors",
                    activeTab === tab.id
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="call-detail-tab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                    />
                  )}
                </button>
              ))}
            </div>

            <ScrollArea className="h-[380px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="p-6"
                >
                  {activeTab === "summary" && (
                    <div className="space-y-5">
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Call Summary</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {data.call_summary}
                        </p>
                      </div>

                      {data.objections_raised.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                            Objections Raised
                          </h4>
                          <div className="space-y-1.5">
                            {data.objections_raised.map((obj, i) => (
                              <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                                {obj}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {Object.keys(data.collected_responses).length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2">Collected Responses</h4>
                          <div className="space-y-2">
                            {Object.entries(data.collected_responses).map(([key, value]) => (
                              <div key={key} className="rounded-lg border bg-muted/30 p-3">
                                <p className="text-xs text-muted-foreground mb-0.5">{key}</p>
                                <p className="text-sm font-medium">{value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === "transcript" && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold mb-2">Full Transcript</h4>
                      <div className="rounded-lg border bg-muted/20 p-4">
                        <pre className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed font-sans">
                          {data.transcript}
                        </pre>
                      </div>
                    </div>
                  )}

                  {activeTab === "qa" && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold mb-2">
                        Question & Answer Pairs ({data.question_pairs.length})
                      </h4>
                      {data.question_pairs.map((qa) => (
                        <motion.div
                          key={qa.question_id}
                          layout
                          className="rounded-lg border overflow-hidden"
                        >
                          <button
                            onClick={() =>
                              setExpandedQA(expandedQA === qa.question_id ? null : qa.question_id)
                            }
                            className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
                          >
                            <span className="text-sm font-medium pr-2">{qa.question_text}</span>
                            {expandedQA === qa.question_id ? (
                              <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                          </button>
                          <AnimatePresence>
                            {expandedQA === qa.question_id && (
                              <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: "auto" }}
                                exit={{ height: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="border-t p-3 space-y-3">
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-1">Agent said:</p>
                                    <p className="text-sm bg-primary/5 rounded-md p-2">{qa.agent_said}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-1">User replied:</p>
                                    <p className="text-sm bg-muted/50 rounded-md p-2">{qa.user_said}</p>
                                  </div>
                                  <div className="flex gap-4 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Timer className="h-3 w-3" />
                                      {qa.duration_seconds}s
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Zap className="h-3 w-3" />
                                      {qa.response_latency_ms}ms latency
                                    </span>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {activeTab === "metrics" && (
                    <div className="space-y-5">
                      <h4 className="text-sm font-semibold mb-2">Call Performance Metrics</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <MetricCard icon={Clock} label="Total Duration" value={data.call_metrics.total_duration_s} unit="s" />
                        <MetricCard icon={MessageSquare} label="Questions Completed" value={data.call_metrics.questions_completed} />
                        <MetricCard icon={Zap} label="Avg Latency" value={data.call_metrics.avg_latency_ms} unit="ms" />
                        <MetricCard icon={Activity} label="P90 Latency" value={data.call_metrics.p90_latency_ms} unit="ms" />
                        <MetricCard icon={Gauge} label="Min Latency" value={data.call_metrics.min_latency_ms} unit="ms" />
                        <MetricCard icon={Timer} label="Max Latency" value={data.call_metrics.max_latency_ms} unit="ms" />
                      </div>

                      {data.call_metrics.total_nudges > 0 && (
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                          <p className="text-sm text-amber-400">
                            <AlertTriangle className="inline h-3.5 w-3.5 mr-1.5" />
                            {data.call_metrics.total_nudges} nudge{data.call_metrics.total_nudges > 1 ? "s" : ""} were needed during this call
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === "qualification" && data.qualification && (
                    <div className="space-y-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <QualificationBadge level={data.qualification.level} />
                          <span className="text-sm text-muted-foreground">
                            Confidence: {data.qualification.confidence}%
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(data.qualification.qualifiedAt)}
                        </span>
                      </div>

                      <Progress value={data.qualification.confidence} className="h-2" />

                      <div>
                        <h4 className="text-sm font-semibold mb-2">Reasoning</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {data.qualification.reasoning}
                        </p>
                      </div>

                      {data.qualification.painPoints.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2">Pain Points Identified</h4>
                          <div className="space-y-1.5">
                            {data.qualification.painPoints.map((point, i) => (
                              <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
                                {point}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {data.qualification.keyInsights.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2">Key Insights</h4>
                          <div className="space-y-1.5">
                            {data.qualification.keyInsights.map((insight, i) => (
                              <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                                {insight}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                        <h4 className="text-sm font-semibold mb-1">Recommended Next Action</h4>
                        <p className="text-sm text-muted-foreground">{data.qualification.recommendedAction}</p>
                      </div>

                      {data.qualification.objectionAnalysis.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2">Objection Analysis</h4>
                          <div className="space-y-3">
                            {data.qualification.objectionAnalysis.map((obj, i) => (
                              <div key={i} className="rounded-lg border p-3 space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{obj.objection}</span>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[10px]",
                                      obj.severity === "high"
                                        ? "text-red-400 border-red-500/20"
                                        : obj.severity === "medium"
                                          ? "text-amber-400 border-amber-500/20"
                                          : "text-green-400 border-green-500/20"
                                    )}
                                  >
                                    {obj.severity}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">{obj.suggestedResponse}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === "qualification" && !data.qualification && (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      <Target className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p>No qualification data available.</p>
                      <p className="mt-1">Set GEMINI_API_KEY in .env.local to enable AI qualification.</p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </ScrollArea>
          </>
        ) : (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <p>No detailed call data available yet.</p>
            <p className="mt-1">Call data will appear here once the call ends.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

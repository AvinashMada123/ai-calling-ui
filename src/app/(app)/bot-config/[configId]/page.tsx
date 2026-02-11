"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  GripVertical,
  Loader2,
  Info,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import type { BotConfig, BotQuestion, BotObjection, BotContextVariables } from "@/types/bot-config";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

type TabId = "prompt" | "context" | "questions" | "objections";

async function apiBotConfigs(
  user: { getIdToken: () => Promise<string> },
  method: "GET" | "POST",
  body?: Record<string, unknown>
) {
  const idToken = await user.getIdToken();
  const res = await fetch("/api/data/bot-configs", {
    method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

export default function BotConfigEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { orgId, user, initialData, refreshProfile } = useAuth();

  const configId = params.configId as string;

  const [config, setConfig] = useState<BotConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("prompt");

  // Local editable state
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [questions, setQuestions] = useState<BotQuestion[]>([]);
  const [objections, setObjections] = useState<BotObjection[]>([]);
  const [contextVariables, setContextVariables] = useState<BotContextVariables>({});
  const hasLoadedRef = useRef(false);

  const populateConfig = useCallback((found: BotConfig) => {
    setConfig(found);
    setName(found.name);
    setPrompt(found.prompt);
    setQuestions([...found.questions].sort((a, b) => a.order - b.order));
    setObjections([...found.objections]);
    setContextVariables(found.contextVariables || {});
    setLoading(false);
    hasLoadedRef.current = true;
  }, []);

  // Load config once — use initialData for instant render, fall back to API
  useEffect(() => {
    if (!orgId || hasLoadedRef.current) return;

    if (initialData?.botConfigs) {
      const found = (initialData.botConfigs as BotConfig[]).find((c) => c.id === configId);
      if (found) {
        populateConfig(found);
        return;
      }
    }

    // Fallback: fetch from server
    if (!user) return;
    (async () => {
      try {
        setLoading(true);
        const data = await apiBotConfigs(user, "GET");
        const found = (data.configs as BotConfig[]).find((c) => c.id === configId);
        if (!found) {
          toast.error("Configuration not found");
          router.push("/bot-config");
          return;
        }
        populateConfig(found);
      } catch {
        toast.error("Failed to load configuration");
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, configId, initialData]);

  async function handleSave() {
    if (!user || !config) return;
    try {
      setSaving(true);

      // Rebuild objectionKeywords from objections
      const objectionKeywords: Record<string, string[]> = {};
      for (const obj of objections) {
        objectionKeywords[obj.key] = obj.keywords;
      }

      await apiBotConfigs(user, "POST", {
        action: "update",
        configId,
        updates: {
          name,
          prompt,
          questions,
          objections,
          objectionKeywords,
          contextVariables,
        },
      });
      toast.success("Configuration saved successfully");
      // Refresh auth context so initialData/cache has the updated bot config
      refreshProfile();
    } catch {
      toast.error("Failed to save configuration");
    } finally {
      setSaving(false);
    }
  }

  // Question helpers
  function handleQuestionUpdate(index: number, field: keyof BotQuestion, value: string | number) {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function handleAddQuestion() {
    const maxOrder = questions.length > 0 ? Math.max(...questions.map((q) => q.order)) + 1 : 0;
    setQuestions((prev) => [
      ...prev,
      {
        id: `q_${crypto.randomUUID().slice(0, 8)}`,
        prompt: "",
        order: maxOrder,
      },
    ]);
  }

  function handleDeleteQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  // Objection helpers
  function handleObjectionUpdate(index: number, field: keyof BotObjection, value: string | string[]) {
    setObjections((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function handleAddObjection() {
    setObjections((prev) => [
      ...prev,
      {
        key: `obj_${crypto.randomUUID().slice(0, 8)}`,
        response: "",
        keywords: [],
      },
    ]);
  }

  function handleDeleteObjection(index: number) {
    setObjections((prev) => prev.filter((_, i) => i !== index));
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "prompt", label: "Prompt" },
    { id: "context", label: "Context" },
    { id: "questions", label: "Questions" },
    { id: "objections", label: "Objections" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/bot-config")}>
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-2xl font-bold border-none shadow-none px-0 h-auto focus-visible:ring-0"
              placeholder="Config name"
            />
            <p className="text-sm text-muted-foreground ml-0.5">
              {config.isActive ? "Active configuration" : "Inactive configuration"}
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save Changes
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <motion.div
                layoutId="botConfigTab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {activeTab === "prompt" && (
          <PromptTab prompt={prompt} onPromptChange={setPrompt} />
        )}
        {activeTab === "context" && (
          <ContextTab
            contextVariables={contextVariables}
            onContextChange={setContextVariables}
          />
        )}
        {activeTab === "questions" && (
          <QuestionsTab
            questions={questions}
            onQuestionUpdate={handleQuestionUpdate}
            onAddQuestion={handleAddQuestion}
            onDeleteQuestion={handleDeleteQuestion}
          />
        )}
        {activeTab === "objections" && (
          <ObjectionsTab
            objections={objections}
            onObjectionUpdate={handleObjectionUpdate}
            onAddObjection={handleAddObjection}
            onDeleteObjection={handleDeleteObjection}
          />
        )}
      </motion.div>
    </div>
  );
}

/* ========== Prompt Tab ========== */
function PromptTab({
  prompt,
  onPromptChange,
}: {
  prompt: string;
  onPromptChange: (v: string) => void;
}) {
  const variables = [
    { name: "{agent_name}", desc: "The AI agent's name" },
    { name: "{customer_name}", desc: "The customer's name" },
    { name: "{company_name}", desc: "Your company name" },
    { name: "{event_host}", desc: "Name of the event host" },
    { name: "{location}", desc: "Office location" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bot System Prompt</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          rows={14}
          className="font-mono text-sm"
          placeholder="Enter the bot system prompt..."
        />
        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">Available Variables</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {variables.map((v) => (
              <div key={v.name} className="flex items-center gap-2 text-sm">
                <Badge variant="secondary" className="font-mono text-xs">
                  {v.name}
                </Badge>
                <span className="text-muted-foreground">{v.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ========== Context Tab ========== */
function ContextTab({
  contextVariables,
  onContextChange,
}: {
  contextVariables: BotContextVariables;
  onContextChange: (v: BotContextVariables) => void;
}) {
  const fields: { key: keyof BotContextVariables; label: string; placeholder: string; variable: string }[] = [
    { key: "agentName", label: "Agent Name", placeholder: "e.g. Priya", variable: "{agent_name}" },
    { key: "companyName", label: "Company Name", placeholder: "e.g. FutureWorks AI", variable: "{company_name}" },
    { key: "eventName", label: "Event Name", placeholder: "e.g. AI Masterclass", variable: "{event_name}" },
    { key: "eventHost", label: "Event Host", placeholder: "e.g. Avinash", variable: "{event_host}" },
    { key: "location", label: "Location", placeholder: "e.g. Hyderabad", variable: "{location}" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Context Variables</CardTitle>
        <p className="text-sm text-muted-foreground">
          These values replace the {"{variable}"} placeholders in your prompt and questions.
          When set here, callers won&apos;t need to fill them in the call form.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label className="text-sm">
                {f.label}
                <Badge variant="secondary" className="ml-2 font-mono text-xs">
                  {f.variable}
                </Badge>
              </Label>
              <Input
                value={contextVariables[f.key] || ""}
                onChange={(e) =>
                  onContextChange({ ...contextVariables, [f.key]: e.target.value })
                }
                placeholder={f.placeholder}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ========== Questions Tab ========== */
function QuestionsTab({
  questions,
  onQuestionUpdate,
  onAddQuestion,
  onDeleteQuestion,
}: {
  questions: BotQuestion[];
  onQuestionUpdate: (index: number, field: keyof BotQuestion, value: string | number) => void;
  onAddQuestion: () => void;
  onDeleteQuestion: (index: number) => void;
}) {
  return (
    <div className="space-y-4">
      {questions.map((q, index) => (
        <motion.div
          key={q.id}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.02 }}
        >
          <Card>
            <CardContent className="flex items-start gap-3 pt-0">
              <div className="flex items-center gap-2 mt-1 shrink-0">
                <GripVertical className="size-4 text-muted-foreground" />
                <div className="w-14">
                  <Label className="text-xs text-muted-foreground">Order</Label>
                  <Input
                    type="number"
                    value={q.order}
                    onChange={(e) => onQuestionUpdate(index, "order", parseInt(e.target.value) || 0)}
                    className="h-8 text-center"
                  />
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Question ID</Label>
                  <Input
                    value={q.id}
                    onChange={(e) => onQuestionUpdate(index, "id", e.target.value)}
                    className="h-8 font-mono text-xs"
                    placeholder="unique_id"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Prompt Text</Label>
                  <Textarea
                    value={q.prompt}
                    onChange={(e) => onQuestionUpdate(index, "prompt", e.target.value)}
                    rows={2}
                    className="text-sm"
                    placeholder="Enter the question prompt..."
                  />
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive hover:text-destructive mt-5"
                onClick={() => onDeleteQuestion(index)}
              >
                <Trash2 className="size-4" />
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ))}
      <Button variant="outline" onClick={onAddQuestion} className="w-full">
        <Plus className="size-4" />
        Add Question
      </Button>
    </div>
  );
}

/* ========== Objections Tab ========== */
function ObjectionsTab({
  objections,
  onObjectionUpdate,
  onAddObjection,
  onDeleteObjection,
}: {
  objections: BotObjection[];
  onObjectionUpdate: (index: number, field: keyof BotObjection, value: string | string[]) => void;
  onAddObjection: () => void;
  onDeleteObjection: (index: number) => void;
}) {
  return (
    <div className="space-y-4">
      {objections.map((obj, index) => (
        <motion.div
          key={obj.key + index}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.02 }}
        >
          <Card>
            <CardContent className="space-y-3 pt-0">
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Key</Label>
                    <Input
                      value={obj.key}
                      onChange={(e) => onObjectionUpdate(index, "key", e.target.value)}
                      className="h-8 font-mono text-xs"
                      placeholder="objection_key"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Response</Label>
                    <Textarea
                      value={obj.response}
                      onChange={(e) => onObjectionUpdate(index, "response", e.target.value)}
                      rows={2}
                      className="text-sm"
                      placeholder="Bot response when this objection is detected..."
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Keywords (comma-separated)
                    </Label>
                    <Input
                      value={obj.keywords.join(", ")}
                      onChange={(e) =>
                        onObjectionUpdate(
                          index,
                          "keywords",
                          e.target.value.split(",").map((k) => k.trim()).filter(Boolean)
                        )
                      }
                      className="h-8 text-sm"
                      placeholder="keyword1, keyword2, keyword3"
                    />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive mt-5"
                  onClick={() => onDeleteObjection(index)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
      <Button variant="outline" onClick={onAddObjection} className="w-full">
        <Plus className="size-4" />
        Add Objection
      </Button>
    </div>
  );
}

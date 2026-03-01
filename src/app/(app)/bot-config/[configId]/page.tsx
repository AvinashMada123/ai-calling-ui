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
  X,
  Sparkles,
  Upload,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  GitBranch,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import type { BotConfig, BotQuestion, BotObjection, BotContextVariables, ParsedBotFlow } from "@/types/bot-config";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { FlowTreeView } from "@/components/bot-config/flow-tree-view";

type TabId = "prompt" | "context" | "questions" | "objections" | "flow";

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
  const [voice, setVoice] = useState("");
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const hasLoadedRef = useRef(false);

  const populateConfig = useCallback((found: BotConfig) => {
    setConfig(found);
    setName(found.name);
    setPrompt(found.prompt);
    setQuestions([...found.questions].sort((a, b) => a.order - b.order));
    setObjections([...found.objections]);
    setContextVariables(found.contextVariables || {});
    setVoice(found.voice || "");
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
          voice,
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

  function handleApplyGeneratedFlow(flow: ParsedBotFlow) {
    setPrompt(flow.prompt);
    setQuestions(flow.questions);
    setObjections(flow.objections);
    setGenerateDialogOpen(false);
    setActiveTab("flow");
    toast.success("Flow applied! Review the tabs and click Save when ready.");
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "prompt", label: "Prompt" },
    { id: "context", label: "Context" },
    { id: "questions", label: "Questions" },
    { id: "objections", label: "Objections" },
    { id: "flow", label: "Flow" },
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setGenerateDialogOpen(true)}>
            <Sparkles className="size-4" />
            Generate from Prompt
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save Changes
          </Button>
        </div>
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
            voice={voice}
            onVoiceChange={setVoice}
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
        {activeTab === "flow" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="size-5" />
                Conversation Flow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FlowTreeView questions={questions} objections={objections} />
            </CardContent>
          </Card>
        )}
      </motion.div>

      {/* Generate from Prompt Dialog */}
      <GenerateFromPromptDialog
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
        onApply={handleApplyGeneratedFlow}
      />
    </div>
  );
}

/* ========== Generate from Prompt Dialog ========== */
function GenerateFromPromptDialog({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (flow: ParsedBotFlow) => void;
}) {
  const { user } = useAuth();
  const [rawPrompt, setRawPrompt] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ParsedBotFlow | null>(null);

  function resetState() {
    setRawPrompt("");
    setParsing(false);
    setError("");
    setPreview(null);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRawPrompt(text);
    e.target.value = "";
  }

  async function handleParse() {
    if (!user || rawPrompt.trim().length < 20) {
      setError("Please provide a script with at least 20 characters.");
      return;
    }
    try {
      setParsing(true);
      setError("");
      const idToken = await user.getIdToken();
      const res = await fetch("/api/bot-config/parse-prompt", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rawPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to parse prompt");
      setPreview(data.flow as ParsedBotFlow);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse prompt");
    } finally {
      setParsing(false);
    }
  }

  const branchCount = preview
    ? preview.questions.filter((q) => q.parentId).length
    : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetState();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5" />
            Generate from Prompt
          </DialogTitle>
          <DialogDescription>
            Paste your sales script and let AI parse it into a structured conversation flow.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          /* Input state */
          <div className="space-y-4">
            <Textarea
              value={rawPrompt}
              onChange={(e) => {
                setRawPrompt(e.target.value);
                setError("");
              }}
              rows={12}
              className="font-mono text-sm"
              placeholder="Paste your raw sales script here..."
              disabled={parsing}
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
                <Upload className="size-4" />
                Upload .txt/.md file
                <input
                  type="file"
                  accept=".txt,.md,.text"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={parsing}
                />
              </label>
              {rawPrompt.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {rawPrompt.length} characters
                </span>
              )}
            </div>
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="size-4 shrink-0" />
                {error}
              </div>
            )}
            <DialogFooter>
              <Button
                onClick={handleParse}
                disabled={parsing || rawPrompt.trim().length < 20}
              >
                {parsing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Analyzing your script...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    Parse with AI
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* Preview state */
          <div className="space-y-4">
            {/* Stats summary */}
            <div className="flex gap-3 flex-wrap">
              <Badge variant="secondary">
                {preview.questions.length} questions
              </Badge>
              <Badge variant="secondary">
                {preview.objections.length} objections
              </Badge>
              {branchCount > 0 && (
                <Badge variant="secondary">
                  <GitBranch className="size-3 mr-1" />
                  {branchCount} branches
                </Badge>
              )}
            </div>

            {/* Warning banner */}
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-amber-800 dark:text-amber-200">
                This will replace your current prompt, questions, and objections. Review the flow below before applying. You&apos;ll still need to click Save.
              </p>
            </div>

            {/* Compact flow preview */}
            <div className="rounded-lg border p-4 max-h-[40vh] overflow-y-auto">
              <FlowTreeView
                questions={preview.questions}
                objections={preview.objections}
                compact
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setPreview(null)}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button onClick={() => onApply(preview)}>
                <ArrowRight className="size-4" />
                Apply to Config
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
const VOICE_OPTIONS = [
  { value: "", label: "Auto-detect from prompt" },
  { value: "Puck", label: "Puck (Male)" },
  { value: "Kore", label: "Kore (Female)" },
  { value: "Charon", label: "Charon (Male)" },
  { value: "Fenrir", label: "Fenrir (Male)" },
  { value: "Aoede", label: "Aoede (Female)" },
];

function ContextTab({
  contextVariables,
  onContextChange,
  voice,
  onVoiceChange,
}: {
  contextVariables: BotContextVariables;
  onContextChange: (v: BotContextVariables) => void;
  voice: string;
  onVoiceChange: (v: string) => void;
}) {
  const fields: { key: Exclude<keyof BotContextVariables, "customVariables">; label: string; placeholder: string; variable: string }[] = [
    { key: "agentName", label: "Agent Name", placeholder: "e.g. Sarah", variable: "{agent_name}" },
    { key: "companyName", label: "Company Name", placeholder: "e.g. Acme Corp", variable: "{company_name}" },
    { key: "eventName", label: "Event Name", placeholder: "e.g. Product Launch", variable: "{event_name}" },
    { key: "eventHost", label: "Event Host", placeholder: "e.g. John", variable: "{event_host}" },
    { key: "location", label: "Location", placeholder: "e.g. Mumbai", variable: "{location}" },
  ];

  const customVars = contextVariables.customVariables || {};

  function addCustomVar() {
    const key = `custom_${Date.now()}`;
    onContextChange({
      ...contextVariables,
      customVariables: { ...customVars, [key]: "" },
    });
  }

  function updateCustomVar(oldKey: string, newKey: string, value: string) {
    const updated = { ...customVars };
    if (oldKey !== newKey) delete updated[oldKey];
    updated[newKey] = value;
    onContextChange({ ...contextVariables, customVariables: updated });
  }

  function removeCustomVar(key: string) {
    const updated = { ...customVars };
    delete updated[key];
    onContextChange({ ...contextVariables, customVariables: updated });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Voice</CardTitle>
          <p className="text-sm text-muted-foreground">
            Choose the AI voice for calls using this configuration. Overrides the voice selected in the call form.
          </p>
        </CardHeader>
        <CardContent>
          <select
            value={voice}
            onChange={(e) => onVoiceChange(e.target.value)}
            className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {VOICE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-background text-foreground">
                {opt.label}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Custom Variables</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Add your own key–value variables. These are sent to the backend as extra context.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={addCustomVar}>
              <Plus className="size-4" />
              Add Variable
            </Button>
          </div>
        </CardHeader>
        {Object.keys(customVars).length > 0 && (
          <CardContent>
            <div className="space-y-3">
              {Object.entries(customVars).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <Input
                    value={key}
                    onChange={(e) => updateCustomVar(key, e.target.value, value)}
                    placeholder="variable_name"
                    className="flex-1 font-mono text-sm"
                  />
                  <Input
                    value={value}
                    onChange={(e) => updateCustomVar(key, key, e.target.value)}
                    placeholder="value"
                    className="flex-1 text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive shrink-0"
                    onClick={() => removeCustomVar(key)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
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
  const [expandedBranch, setExpandedBranch] = useState<number | null>(null);

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
                {/* Branch settings toggle */}
                <button
                  type="button"
                  onClick={() => setExpandedBranch(expandedBranch === index ? null : index)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {expandedBranch === index ? (
                    <ChevronUp className="size-3" />
                  ) : (
                    <ChevronDown className="size-3" />
                  )}
                  Branch settings
                  {(q.parentId || q.condition) && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">
                      branched
                    </Badge>
                  )}
                </button>
                {expandedBranch === index && (
                  <div className="grid grid-cols-2 gap-2 p-2 rounded border bg-muted/30">
                    <div>
                      <Label className="text-xs text-muted-foreground">Parent Question</Label>
                      <select
                        value={q.parentId || ""}
                        onChange={(e) => onQuestionUpdate(index, "parentId", e.target.value)}
                        className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        <option value="">None (root)</option>
                        {questions
                          .filter((_, i) => i !== index)
                          .map((other) => (
                            <option key={other.id} value={other.id}>
                              {other.id}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Condition</Label>
                      <Input
                        value={q.condition || ""}
                        onChange={(e) => onQuestionUpdate(index, "condition", e.target.value)}
                        className="h-8 text-xs"
                        placeholder='e.g. "yes", "not interested"'
                      />
                    </div>
                  </div>
                )}
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

"use client";

import { GitBranch, Zap, MessageSquare, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BotQuestion, BotObjection } from "@/types/bot-config";

interface TreeNode {
  question: BotQuestion;
  children: TreeNode[];
}

export function buildFlowTree(questions: BotQuestion[]): TreeNode[] {
  const sorted = [...questions].sort((a, b) => a.order - b.order);
  const nodeMap = new Map<string, TreeNode>();

  for (const q of sorted) {
    nodeMap.set(q.id, { question: q, children: [] });
  }

  const roots: TreeNode[] = [];
  for (const q of sorted) {
    const node = nodeMap.get(q.id)!;
    if (q.parentId && nodeMap.has(q.parentId)) {
      nodeMap.get(q.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function FlowNode({
  node,
  depth,
  isLast,
  compact,
}: {
  node: TreeNode;
  depth: number;
  isLast: boolean;
  compact?: boolean;
}) {
  const q = node.question;
  const hasBranches = node.children.length > 0;

  return (
    <div className={depth > 0 ? "ml-6 relative" : ""}>
      {/* Vertical connector line */}
      {depth > 0 && (
        <>
          <div className="absolute left-[-16px] top-0 bottom-0 w-px bg-border" />
          <div className="absolute left-[-16px] top-5 w-4 h-px bg-border" />
        </>
      )}

      <div className={`relative ${compact ? "mb-2" : "mb-3"}`}>
        <div
          className={`rounded-lg border bg-card p-3 ${
            compact ? "text-sm" : ""
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="text-xs font-mono text-muted-foreground shrink-0 mt-0.5">
              {q.order}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                <span className="font-mono text-xs text-muted-foreground">
                  {q.id}
                </span>
                {q.condition && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 ${
                      q.condition.toLowerCase().includes("yes") ||
                      q.condition.toLowerCase().includes("interested")
                        ? "border-green-500/50 text-green-600 dark:text-green-400"
                        : q.condition.toLowerCase().includes("no") ||
                          q.condition.toLowerCase().includes("not")
                        ? "border-red-500/50 text-red-600 dark:text-red-400"
                        : "border-blue-500/50 text-blue-600 dark:text-blue-400"
                    }`}
                  >
                    {q.condition}
                  </Badge>
                )}
                {q.isHighSignal && (
                  <Zap className="size-3 text-amber-500 shrink-0" />
                )}
                {hasBranches && (
                  <GitBranch className="size-3 text-purple-500 shrink-0" />
                )}
                {q.category && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {q.category}
                  </Badge>
                )}
              </div>
              <p className={`text-sm ${compact ? "line-clamp-2" : ""}`}>
                {q.prompt}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Children */}
      {node.children.length > 0 && (
        <div>
          {node.children.map((child, i) => (
            <FlowNode
              key={child.question.id}
              node={child}
              depth={depth + 1}
              isLast={i === node.children.length - 1}
              compact={compact}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FlowTreeView({
  questions,
  objections,
  compact,
}: {
  questions: BotQuestion[];
  objections?: BotObjection[];
  compact?: boolean;
}) {
  const tree = buildFlowTree(questions);

  if (questions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No questions defined yet. Add questions in the Questions tab or generate from a prompt.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        {tree.map((node, i) => (
          <FlowNode
            key={node.question.id}
            node={node}
            depth={0}
            isLast={i === tree.length - 1}
            compact={compact}
          />
        ))}
      </div>

      {/* Objection handlers */}
      {objections && objections.length > 0 && (
        <div className={`border-t pt-4 ${compact ? "mt-2" : "mt-4"}`}>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              Objection Handlers ({objections.length})
            </span>
          </div>
          <div className="grid gap-2">
            {objections.map((obj) => (
              <div
                key={obj.key}
                className="rounded-lg border bg-card p-2.5 text-sm"
              >
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="size-3 text-muted-foreground shrink-0" />
                  <span className="font-mono text-xs text-muted-foreground">
                    {obj.key}
                  </span>
                  <div className="flex gap-1 flex-wrap">
                    {obj.keywords.slice(0, compact ? 3 : undefined).map((kw) => (
                      <Badge
                        key={kw}
                        variant="secondary"
                        className="text-[10px] px-1 py-0"
                      >
                        {kw}
                      </Badge>
                    ))}
                    {compact && obj.keywords.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{obj.keywords.length - 3}
                      </span>
                    )}
                  </div>
                </div>
                <p className={compact ? "line-clamp-1" : ""}>{obj.response}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

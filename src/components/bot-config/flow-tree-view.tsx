"use client";

import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { Zap, GitBranch, Shield, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BotQuestion, BotObjection } from "@/types/bot-config";

/* ========== Custom Node Components ========== */

function QuestionNode({ data }: { data: BotQuestion & { hasBranches: boolean } }) {
  const categoryColors: Record<string, string> = {
    greeting: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    discovery: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    qualification: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
    objection_handling: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
    closing: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    followup: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  };

  const catClass = data.category ? categoryColors[data.category] || "bg-muted text-muted-foreground" : "";

  return (
    <div className="bg-card border-2 border-border rounded-xl shadow-md px-4 py-3 min-w-[200px] max-w-[280px]">
      <Handle type="target" position={Position.Top} className="!bg-primary !w-3 !h-3 !border-2 !border-background" />

      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        <span className="font-mono text-[11px] font-semibold text-muted-foreground">{data.id}</span>
        {data.isHighSignal && <Zap className="size-3.5 text-amber-500" />}
        {data.hasBranches && <GitBranch className="size-3.5 text-purple-500" />}
      </div>

      {data.category && (
        <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mb-1.5 ${catClass}`}>
          {data.category}
        </span>
      )}

      <p className="text-sm leading-snug line-clamp-3">{data.prompt}</p>

      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-3 !h-3 !border-2 !border-background" />
    </div>
  );
}

function ObjectionNode({ data }: { data: BotObjection }) {
  return (
    <div className="bg-orange-50 dark:bg-orange-950/30 border-2 border-orange-300 dark:border-orange-700 rounded-xl shadow-md px-4 py-3 min-w-[180px] max-w-[260px]">
      <Handle type="target" position={Position.Top} className="!bg-orange-500 !w-3 !h-3 !border-2 !border-background" />

      <div className="flex items-center gap-1.5 mb-1.5">
        <Shield className="size-3.5 text-orange-500" />
        <span className="font-mono text-[11px] font-semibold text-orange-600 dark:text-orange-400">{data.key}</span>
      </div>

      <div className="flex gap-1 flex-wrap mb-1.5">
        {data.keywords.slice(0, 3).map((kw) => (
          <span key={kw} className="text-[10px] bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded-full">
            {kw}
          </span>
        ))}
        {data.keywords.length > 3 && (
          <span className="text-[10px] text-orange-500">+{data.keywords.length - 3}</span>
        )}
      </div>

      <p className="text-xs leading-snug line-clamp-2 text-orange-800 dark:text-orange-200">{data.response}</p>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  question: QuestionNode,
  objection: ObjectionNode,
};

/* ========== Dagre Layout ========== */

const NODE_WIDTH = 260;
const NODE_HEIGHT = 120;
const OBJECTION_WIDTH = 240;
const OBJECTION_HEIGHT = 100;

function layoutGraph(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 80 });

  for (const node of nodes) {
    const w = node.type === "objection" ? OBJECTION_WIDTH : NODE_WIDTH;
    const h = node.type === "objection" ? OBJECTION_HEIGHT : NODE_HEIGHT;
    g.setNode(node.id, { width: w, height: h });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    const w = node.type === "objection" ? OBJECTION_WIDTH : NODE_WIDTH;
    const h = node.type === "objection" ? OBJECTION_HEIGHT : NODE_HEIGHT;
    return {
      ...node,
      position: { x: pos.x - w / 2, y: pos.y - h / 2 },
    };
  });
}

/* ========== Build Nodes & Edges ========== */

function buildNodesAndEdges(
  questions: BotQuestion[],
  objections: BotObjection[]
): { nodes: Node[]; edges: Edge[] } {
  const sorted = [...questions].sort((a, b) => a.order - b.order);
  const childrenOf = new Map<string, BotQuestion[]>();

  for (const q of sorted) {
    if (q.parentId) {
      const siblings = childrenOf.get(q.parentId) || [];
      siblings.push(q);
      childrenOf.set(q.parentId, siblings);
    }
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Question nodes
  for (const q of sorted) {
    nodes.push({
      id: q.id,
      type: "question",
      position: { x: 0, y: 0 },
      data: { ...q, hasBranches: childrenOf.has(q.id) },
    });
  }

  // Edges: parent->child with condition labels, or sequential for root linear flow
  const roots = sorted.filter((q) => !q.parentId);
  for (let i = 0; i < roots.length - 1; i++) {
    edges.push({
      id: `e-${roots[i].id}-${roots[i + 1].id}`,
      source: roots[i].id,
      target: roots[i + 1].id,
      animated: true,
      style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
    });
  }

  // Branch edges
  for (const [parentId, children] of childrenOf.entries()) {
    for (const child of children) {
      const isPositive =
        child.condition?.toLowerCase().includes("yes") ||
        child.condition?.toLowerCase().includes("interested");
      const isNegative =
        child.condition?.toLowerCase().includes("no") ||
        child.condition?.toLowerCase().includes("not");

      edges.push({
        id: `e-${parentId}-${child.id}`,
        source: parentId,
        target: child.id,
        label: child.condition || undefined,
        animated: true,
        style: {
          stroke: isPositive
            ? "#22c55e"
            : isNegative
            ? "#ef4444"
            : "#3b82f6",
          strokeWidth: 2,
        },
        labelStyle: {
          fontSize: 11,
          fontWeight: 600,
          fill: isPositive ? "#16a34a" : isNegative ? "#dc2626" : "#2563eb",
        },
        labelBgStyle: {
          fill: "hsl(var(--card))",
          fillOpacity: 0.9,
        },
      });
    }
  }

  // Objection nodes (attached to the side)
  if (objections.length > 0) {
    for (const obj of objections) {
      const nodeId = `obj-${obj.key}`;
      nodes.push({
        id: nodeId,
        type: "objection",
        position: { x: 0, y: 0 },
        data: obj as unknown as Record<string, unknown>,
      });

      // Connect objections to the first objection_handling question, or the last root question
      const objHandlerQ = sorted.find((q) => q.category === "objection_handling");
      const connectTo = objHandlerQ?.id || roots[roots.length - 1]?.id;
      if (connectTo) {
        edges.push({
          id: `e-${connectTo}-${nodeId}`,
          source: connectTo,
          target: nodeId,
          style: { stroke: "#f97316", strokeWidth: 1.5, strokeDasharray: "5 5" },
          animated: false,
        });
      }
    }
  }

  return { nodes: layoutGraph(nodes, edges), edges };
}

/* ========== Main Component ========== */

function FlowDiagramInner({
  questions,
  objections,
  compact,
}: {
  questions: BotQuestion[];
  objections?: BotObjection[];
  compact?: boolean;
}) {
  const { nodes, edges } = useMemo(
    () => buildNodesAndEdges(questions, objections || []),
    [questions, objections]
  );

  const { fitView } = useReactFlow();

  const onInit = useCallback(() => {
    setTimeout(() => fitView({ padding: 0.2 }), 50);
  }, [fitView]);

  if (questions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No questions defined yet. Add questions in the Questions tab or use &quot;Convert to Flow&quot; to generate from your prompt.
      </div>
    );
  }

  return (
    <div className={compact ? "h-[350px]" : "h-[600px]"}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={onInit}
        fitView
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        className="rounded-lg"
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
        {!compact && <MiniMap zoomable pannable className="!bg-muted !border-border" />}
      </ReactFlow>
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
  return (
    <ReactFlowProvider>
      <FlowDiagramInner questions={questions} objections={objections} compact={compact} />
    </ReactFlowProvider>
  );
}

// Keep buildFlowTree export for backward compat
export function buildFlowTree(questions: BotQuestion[]) {
  const sorted = [...questions].sort((a, b) => a.order - b.order);
  const nodeMap = new Map<string, { question: BotQuestion; children: { question: BotQuestion; children: unknown[] }[] }>();
  for (const q of sorted) {
    nodeMap.set(q.id, { question: q, children: [] });
  }
  const roots: { question: BotQuestion; children: unknown[] }[] = [];
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

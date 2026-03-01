import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import type { ParsedBotFlow } from "@/types/bot-config";

async function getUid(request: NextRequest): Promise<string | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const decoded = await getAdminAuth().verifyIdToken(authHeader.slice(7));
  const userDoc = await getAdminDb().collection("users").doc(decoded.uid).get();
  if (!userDoc.exists) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return decoded.uid;
}

const SYSTEM_PROMPT = `You are an expert sales script analyzer. Given a raw sales script or prompt, parse it into a structured conversation flow.

Output ONLY valid JSON (no markdown, no code fences) matching this exact schema:
{
  "prompt": "<cleaned system prompt for the AI caller — voice, persona, rules>",
  "questions": [
    {
      "id": "<snake_case unique id, e.g. greeting, opening, interest_check>",
      "prompt": "<the exact question/script line the bot should say>",
      "category": "<one of: greeting, discovery, qualification, objection_handling, closing, followup>",
      "isHighSignal": <true if this question reveals buying intent, budget, authority, or timeline>,
      "order": <0-based index in the flat list>,
      "parentId": "<id of the parent question this branches from, or omit for root/linear flow>",
      "condition": "<condition label like 'yes', 'no', 'interested', 'not interested', or omit for linear flow>"
    }
  ],
  "objections": [
    {
      "key": "<snake_case key, e.g. busy, not_interested>",
      "response": "<what the bot should say>",
      "keywords": ["keyword1", "keyword2"]
    }
  ],
  "qualificationCriteria": {
    "hot": "<criteria for hot lead>",
    "warm": "<criteria for warm lead>",
    "cold": "<criteria for cold lead>"
  }
}

Rules:
- Extract ALL questions/steps from the script in order
- Identify branching points (if-else, conditional paths) and set parentId + condition
- Questions without branches should NOT have parentId or condition
- Root questions (no parent) form the main linear flow
- Branch children share the same parentId but different condition values
- Every parentId must reference an existing question id
- Extract objection handlers with relevant keywords
- The prompt field should contain the persona/voice/rules, NOT the questions themselves
- If no branching is evident, output a flat linear flow (no parentId/condition on any question)
- If no qualification criteria are mentioned, provide reasonable defaults`;

export async function POST(request: NextRequest) {
  try {
    const result = await getUid(request);
    if (result instanceof NextResponse) return result;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API key not configured. Set GEMINI_API_KEY in your environment." },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { rawPrompt } = body as { rawPrompt?: string };
    if (!rawPrompt || rawPrompt.trim().length < 20) {
      return NextResponse.json(
        { error: "Please provide a script with at least 20 characters." },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const genResult = await model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: `Here is the raw sales script/prompt to parse:\n\n${rawPrompt}` },
    ]);

    const text = genResult.response.text().trim();
    const cleaned = text.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(cleaned) as ParsedBotFlow;

    // Validate structure
    if (!parsed.prompt || typeof parsed.prompt !== "string") {
      throw new Error("Missing or invalid prompt in response");
    }
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      throw new Error("No questions extracted from script");
    }
    if (!Array.isArray(parsed.objections)) {
      parsed.objections = [];
    }
    if (!parsed.qualificationCriteria) {
      parsed.qualificationCriteria = {
        hot: "Shows clear intent, has budget and authority, ready to act soon",
        warm: "Interested but no clear urgency or timeline",
        cold: "Just exploring, no real intent to proceed",
      };
    }

    // Validate parentId references
    const questionIds = new Set(parsed.questions.map((q) => q.id));
    for (const q of parsed.questions) {
      if (q.parentId && !questionIds.has(q.parentId)) {
        // Remove invalid parentId reference
        delete q.parentId;
        delete q.condition;
      }
      // Ensure required fields
      if (!q.id || !q.prompt) {
        throw new Error(`Question missing required fields: ${JSON.stringify(q)}`);
      }
      if (typeof q.order !== "number") {
        q.order = parsed.questions.indexOf(q);
      }
    }

    return NextResponse.json({ flow: parsed });
  } catch (error) {
    console.error("[parse-prompt] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to parse prompt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

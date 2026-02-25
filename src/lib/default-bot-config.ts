import type { BotConfig } from "@/types/bot-config";

// Generic default bot config template - seeds for new organizations.
// All FWAI-specific content has been removed. Organizations should customize
// this via the Bot Config editor in the UI.
export const DEFAULT_BOT_CONFIG: Omit<BotConfig, "id" | "createdAt" | "updatedAt" | "createdBy"> = {
  name: "Default Config",
  isActive: true,
  prompt: `You are {agent_name} from {company_name}, making a follow-up call. GOAL: Understand the prospect's situation, uncover their needs, and qualify them. VOICE: Professional and conversational. Warm, friendly tone. If asked if you're AI: 'No, I'm {agent_name} from {company_name}.' RULES: Ask ONE question per turn from [INSTRUCTION]. After asking, STOP and wait for their response. Brief acknowledgment after they answer ('Got it', 'I see'), then WAIT for next [INSTRUCTION]. Do NOT make up questions.`,
  questions: [
    { id: "greeting", prompt: "Hi {customer_name}, this is {agent_name} from {company_name}. How are you doing?", order: 0 },
    { id: "opening", prompt: "I'm following up regarding {event_name}. Did you get a chance to check it out?", order: 1 },
    { id: "current_situation", prompt: "Tell me a bit about yourself. What do you do currently?", order: 2 },
    { id: "interest_reason", prompt: "What made you interested? Was there something specific you were looking for?", order: 3 },
    { id: "challenges", prompt: "What's been your biggest challenge in this area so far?", order: 4 },
    { id: "goals", prompt: "What's your main goal? What would success look like for you?", order: 5 },
    { id: "timeline", prompt: "When are you looking to get started? Immediately or in a few months?", order: 6 },
    { id: "decision", prompt: "If something makes sense, can you decide on your own or need to discuss with someone?", order: 7 },
    { id: "callback_booking", prompt: "Based on what you've shared, I think a detailed conversation would help. When's a good time for a callback?", order: 8 },
    { id: "closing", prompt: "Perfect, I'll arrange that for you. It was really nice talking to you, {customer_name}. Take care!", order: 9 },
  ],
  objections: [
    { key: "busy", response: "No worries! When's a better time to talk?", keywords: ["busy", "call later", "not now", "bad time", "meeting", "driving"] },
    { key: "not_interested", response: "No problem at all. Thanks for your time, take care!", keywords: ["not interested", "no thanks", "don't want", "not for me"] },
    { key: "need_time", response: "Of course, take your time. Should I call back tomorrow?", keywords: ["think about it", "need time", "discuss", "family", "later"] },
    { key: "cost", response: "I understand. Let me connect you with someone who can walk you through the options.", keywords: ["expensive", "cost", "price", "afford", "budget"] },
  ],
  objectionKeywords: {
    busy: ["busy", "call later", "not now", "bad time", "meeting", "driving"],
    not_interested: ["not interested", "no thanks", "don't want", "not for me"],
    need_time: ["think about it", "need time", "discuss", "family", "later"],
    cost: ["expensive", "cost", "price", "afford", "budget"],
  },
  contextVariables: {
    agentName: "",
    companyName: "",
    eventName: "",
    eventHost: "",
    location: "",
  },
  qualificationCriteria: {
    hot: "Shows clear intent, has budget and authority, ready to act soon",
    warm: "Interested but no clear urgency or timeline",
    cold: "Just exploring, no real intent to proceed",
  },
};

export interface CallRequest {
  phoneNumber: string;
  contactName: string;
  clientName: string;
  agentName: string;
  companyName: string;
  eventName: string;
  eventHost: string;
  voice: string;
  location: string;
}

export interface CallResponse {
  success: boolean;
  call_uuid: string;
  message: string;
}

export interface CallEndedData {
  call_uuid: string;
  caller_phone: string;
  contact_name: string;
  client_name: string;
  duration_seconds: number;
  timestamp: string;
  questions_completed: number;
  total_questions: number;
  completion_rate: number;
  interest_level: string;
  call_summary: string;
  objections_raised: string[];
  collected_responses: Record<string, string>;
  question_pairs: QuestionPair[];
  call_metrics: CallMetrics;
  transcript: string;
}

export interface QuestionPair {
  question_id: string;
  question_text: string;
  agent_said: string;
  user_said: string;
  duration_seconds: number;
  response_latency_ms: number;
}

export interface CallMetrics {
  questions_completed: number;
  total_duration_s: number;
  avg_latency_ms: number;
  max_latency_ms: number;
  min_latency_ms: number;
  p90_latency_ms: number;
  total_nudges: number;
}

export interface CallRecord {
  id: string;
  callUuid: string;
  leadId?: string;
  request: CallRequest;
  response?: CallResponse;
  status: CallStatus;
  initiatedAt: string;
  notes?: string;
  endedData?: CallEndedData;
  durationSeconds?: number;
  interestLevel?: string;
  completionRate?: number;
  callSummary?: string;
}

export type CallStatus =
  | "initiating"
  | "in-progress"
  | "completed"
  | "failed"
  | "no-answer";

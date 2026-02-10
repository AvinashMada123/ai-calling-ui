export interface ApiCallPayload {
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

export interface ApiCallResponse {
  success: boolean;
  call_uuid: string;
  message: string;
}

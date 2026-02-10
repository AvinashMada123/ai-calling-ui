export interface AppSettings {
  defaults: {
    clientName: string;
    agentName: string;
    companyName: string;
    eventName: string;
    eventHost: string;
    voice: string;
    location: string;
  };
  webhookUrl: string;
  appearance: {
    sidebarCollapsed: boolean;
    animationsEnabled: boolean;
  };
}

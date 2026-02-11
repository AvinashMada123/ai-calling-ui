export interface BotQuestion {
  id: string;
  prompt: string;
  category?: string;
  isHighSignal?: boolean;
  order: number;
}

export interface BotObjection {
  key: string;
  response: string;
  keywords: string[];
}

export interface BotConfig {
  id: string;
  name: string;
  isActive: boolean;
  prompt: string;
  questions: BotQuestion[];
  objections: BotObjection[];
  objectionKeywords: Record<string, string[]>;
  qualificationCriteria: {
    hot: string;
    warm: string;
    cold: string;
  };
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

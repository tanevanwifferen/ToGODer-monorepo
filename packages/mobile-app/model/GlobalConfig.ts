export interface Prompt {
  prompt: string;
  description: string;
  display: boolean;
}

export interface PromptsResponse {
  [promptId: string]: Prompt;
}

export interface Model {
  model: string;
  title: string;
  /** Whether the model supports PDF / document input (OpenRouter input_modalities includes "file"). */
  supportsDocuments?: boolean;
}

export interface DonateOption {
  name: string;
  address: string;
  url?: string;
}

export interface GlobalConfig {
  donateOptions: DonateOption[];
  quote: string;
  models: Model[];
  prompts: {
    [promptId: string]: Prompt;
  };
  showLogin: boolean;
  userOnboarded: boolean;
  appFirstLaunch: boolean;
  libraryIntegrationEnabled: boolean;
  librarianApiUrl: string;
  previousDefaultModel: string;
  /** Whether the (optional) billed emotion-analysis feature is configured server-side. */
  sentimentEnabled?: boolean;
}

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
}

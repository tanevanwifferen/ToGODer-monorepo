import { config as loadEnv } from "dotenv";

loadEnv();

const requiredEnvVars = [
  "MCP_USERNAME",
  "MCP_PASSWORD",
  "TOGODER_API_BASE_URL",
] as const;

function ensureEnv() {
  const missing = requiredEnvVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

ensureEnv();

export interface AppConfig {
  credentials: {
    username: string;
    password: string;
  };
  remoteApi: {
    baseUrl: string;
  };
  chat: {
    model: string;
  };
}

export const appConfig: AppConfig = {
  credentials: {
    username: process.env.MCP_USERNAME as string,
    password: process.env.MCP_PASSWORD as string,
  },
  remoteApi: {
    baseUrl: process.env.TOGODER_API_BASE_URL as string,
  },
  chat: {
    model: process.env.MCP_CHAT_MODEL || "deepseek/deepseek-chat-v3.1",
  },
};

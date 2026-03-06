import { store } from "@/redux";
import axios from "axios";
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { Platform } from "react-native";
import { getApiUrl } from "@/constants/Env";

export interface AuthStore {
  token: string | null;
}

export interface RateLimitError {
  type: "RateLimit";
  waitTime: number;
  minutes: number;
  seconds: number;
}

export class InvalidResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidResponseError";
  }
}

export class ApiClient {
  private static get_base_url() {
    return getApiUrl();
  }
  private static axiosInstance: AxiosInstance = axios.create({
    baseURL: this.get_base_url(),
    headers: {
      "Content-Type": "application/json",
    },
  });

  static initialize(): void {
    // Response interceptor for handling common errors
    ApiClient.axiosInstance.interceptors.response.use(
      (response: AxiosResponse) => response,
      (error: unknown) => {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          const retryAfter = error.response.headers["retry-after"];
          const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
          return Promise.reject({
            type: "RateLimit",
            waitTime,
            minutes: Math.floor(waitTime / 60000),
            seconds: Math.floor((waitTime % 60000) / 1000),
          } as RateLimitError);
        }
        console.error("API error:", error);
        return Promise.reject(
          (error as any)?.error ?? (error as any).response?.data
        );
      }
    );
  }

  static extendConfig(config: AxiosRequestConfig): AxiosRequestConfig {
    const token = store.getState().auth.token;
    const headers: any = {
      ...config.headers,
      "Content-Type": "application/json",
    };
    if (!!token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const toreturn = {
      ...config,
      headers,
    };
    return toreturn;
  }

  private static validateJsonResponse<T>(response: AxiosResponse<T>): T {
    const contentType = response.headers["content-type"] || "";
    const data = response.data;

    // Check if response is HTML (common error page response)
    if (typeof data === "string") {
      const trimmed = data.trim();
      if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") || trimmed.startsWith("<")) {
        throw new InvalidResponseError(
          `Server returned HTML instead of JSON. This usually indicates a server error or network issue.`
        );
      }
      throw new InvalidResponseError(
        `Expected JSON object but received string. Content-Type: ${contentType}`
      );
    }

    // Ensure response is an object (not null, undefined, or primitive)
    if (data === null || data === undefined) {
      throw new InvalidResponseError("Server returned empty response");
    }

    if (typeof data !== "object") {
      throw new InvalidResponseError(
        `Expected JSON object but received ${typeof data}`
      );
    }

    return data;
  }

  static async get<T>(
    url: string,
    config: AxiosRequestConfig = {}
  ): Promise<T> {
    if (!ApiClient.axiosInstance) {
      throw new Error("ApiClient not initialized");
    }
    const response = await ApiClient.axiosInstance.get<T>(
      url,
      ApiClient.extendConfig(config)
    );
    return ApiClient.validateJsonResponse(response);
  }

  static async post<T>(
    url: string,
    data: unknown = {},
    config: AxiosRequestConfig = {}
  ): Promise<T> {
    if (!ApiClient.axiosInstance) {
      throw new Error("ApiClient not initialized");
    }
    const response = await ApiClient.axiosInstance.post<T>(
      url,
      data,
      ApiClient.extendConfig(config)
    );
    return ApiClient.validateJsonResponse(response);
  }

  static async put<T>(
    url: string,
    data: unknown = {},
    config: AxiosRequestConfig = {}
  ): Promise<T> {
    if (!ApiClient.axiosInstance) {
      throw new Error("ApiClient not initialized");
    }
    const response = await ApiClient.axiosInstance.put<T>(
      url,
      data,
      ApiClient.extendConfig(config)
    );
    return ApiClient.validateJsonResponse(response);
  }

  static async delete<T>(
    url: string,
    config: AxiosRequestConfig = {}
  ): Promise<T> {
    if (!ApiClient.axiosInstance) {
      throw new Error("ApiClient not initialized");
    }
    const response = await ApiClient.axiosInstance.delete<T>(
      url,
      ApiClient.extendConfig(config)
    );
    return ApiClient.validateJsonResponse(response);
  }
}

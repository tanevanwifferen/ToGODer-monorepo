import { request } from "undici";
import { appConfig } from "../config.js";
import type { AuthTokens, AuthenticatedContext } from "../types.js";
import { generateId } from "../utils/id.js";

interface RemoteAuthResponse {
  token: string;
  userId: string;
  date: number;
}

interface SessionRecord extends AuthTokens {}

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // Backend tokens last 24 hours.
const REFRESH_LEEWAY_MS = 5 * 60 * 1000; // Refresh when <5 minutes remain.

export class AuthService {
  private readonly credentials = appConfig.credentials;
  private readonly baseUrl = appConfig.remoteApi.baseUrl.replace(/\/+$/, "");
  private readonly sessions = new Map<string, SessionRecord>();

  async login(username: string, password: string): Promise<AuthTokens> {
    if (
      username !== this.credentials.username ||
      password !== this.credentials.password
    ) {
      throw new Error("Invalid credentials.");
    }

    const remoteAuth = await this.fetchRemoteLogin();
    const session = this.createSession(remoteAuth);
    this.sessions.set(session.sessionToken, session);
    return session;
  }

  async authenticate(sessionToken: string): Promise<AuthenticatedContext> {
    const session = this.sessions.get(sessionToken);

    if (!session) {
      throw new Error("Unknown session token.");
    }

    const now = Date.now();
    if (session.remoteTokenExpiresAt - now <= REFRESH_LEEWAY_MS) {
      const refreshed = await this.refreshRemoteToken(session);
      this.sessions.set(sessionToken, refreshed);
      return { session: refreshed, tokensUpdated: true };
    }

    return { session, tokensUpdated: false };
  }

  private async fetchRemoteLogin(): Promise<RemoteAuthResponse> {
    const response = await request(`${this.baseUrl}/api/auth/signIn`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        email: this.credentials.username,
        password: this.credentials.password
      })
    });

    if (response.statusCode !== 200) {
      const message = await response.body.text();
      throw new Error(
        `Failed to authenticate with ToGODer backend: ${
          message || `status ${response.statusCode}`
        }`
      );
    }

    return (await response.body.json()) as RemoteAuthResponse;
  }

  private createSession(remote: RemoteAuthResponse): SessionRecord {
    return {
      sessionToken: generateId("session"),
      remoteToken: remote.token,
      remoteTokenExpiresAt: remote.date + TOKEN_TTL_MS,
      userId: remote.userId
    };
  }

  private async refreshRemoteToken(
    session: SessionRecord
  ): Promise<SessionRecord> {
    const response = await request(`${this.baseUrl}/api/auth/updateToken`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.remoteToken}`
      },
      body: JSON.stringify({
        userId: session.userId
      })
    });

    if (response.statusCode !== 200) {
      const message = await response.body.text();
      throw new Error(
        `Failed to refresh ToGODer token: ${
          message || `status ${response.statusCode}`
        }`
      );
    }

    const data = (await response.body.json()) as { token: string };

    return {
      ...session,
      remoteToken: data.token,
      remoteTokenExpiresAt: Date.now() + TOKEN_TTL_MS
    };
  }
}

import { ApiClient } from './ApiClient';
import type { 
  SignInRequest, 
  UpdateTokenRequest, 
  ResetPasswordRequest,
  AuthResponse,
  BillingResponse 
} from '../model/AuthRequest';

/**
 * Client for handling authentication-related API requests.
 * Provides methods for user authentication, token management, and password recovery.
 * Tokens obtained through these endpoints do not expire.
 */
export class AuthApiClient {
  static async refreshBilling(): Promise<BillingResponse> {
    return ApiClient.get<BillingResponse>('/billing');
  }

  static async refreshToken(userId: string): Promise<AuthResponse> {
    const request: UpdateTokenRequest = { userId };
    return ApiClient.post<AuthResponse>('/auth/updateToken', request);
  }

  static async createUser(email: string, password: string): Promise<AuthResponse> {
    const request: SignInRequest = { email, password };
    return ApiClient.post<AuthResponse>('/auth/signUp', request);
  }

  static async login(email: string, password: string): Promise<AuthResponse> {
    const request: SignInRequest = { email, password };
    return ApiClient.post<AuthResponse>('/auth/signIn', request);
  }

  static async sendForgotPasswordEmail(email: string): Promise<void> {
    return ApiClient.post<void>(`/auth/forgotPassword/${email}`);
  }

  static async setNewPassword(code: string, email: string, password: string): Promise<void> {
    const request: ResetPasswordRequest = { email, password };
    return ApiClient.post<void>(`/auth/resetPassword/${code}`, request);
  }

  static async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return ApiClient.post<void>('/auth/changePassword', {
      currentPassword,
      newPassword,
      confirmPassword: newPassword
    });
  }
}

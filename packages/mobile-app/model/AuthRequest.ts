export interface SignInRequest {
  email: string;
  password: string;
}

export interface UpdateTokenRequest {
  userId: string;
}

export interface ResetPasswordRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  userId: string;
}

export interface BillingResponse {
  credits: number;
  subscription: {
    active: boolean;
    plan: string;
    expiresAt?: string;
  };
}

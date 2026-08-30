export type AuthMode = 'disabled' | 'optional' | 'required';

export interface AuthConfig {
  mode: AuthMode;
  serviceName: string;
  sharedSecret?: string;
  tokenIssuerOrder: string[];
  tokenTtlSeconds: number;
}

export interface AuthenticatedUser {
  userId: string;
  displayName: string;
  permissions: string[];
}

export interface AccessTokenClaims extends AuthenticatedUser {
  iss: string;
  sub: string;
  iat: number;
  exp: number;
}

import type { UserRole } from "@quanta/shared";

export interface JwtPayload {
  /** User id (uuid). */
  sub: string;
  email: string;
  role: UserRole;
  /** "access" | "refresh" — prevents a refresh token being used as access token. */
  tokenType: "access" | "refresh";
}

export interface AuthenticatedRequestUser {
  id: string;
  email: string;
  role: UserRole;
}

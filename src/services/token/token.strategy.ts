import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "classroom_secret_key";
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET ?? "classroom_refresh_secret_key";
const JWT_EXPIRES_IN = "15m";
const REFRESH_TOKEN_EXPIRES_IN = "7d";

export interface TokenPayload {
  userId: string;
  role: string;
}

export interface ITokenStrategy {
  generateAccessToken(payload: TokenPayload): string;
  generateRefreshToken(payload: { userId: string }): string;
  verifyAccessToken(token: string): TokenPayload;
  verifyRefreshToken(token: string): { userId: string };
}

export class JwtTokenStrategy implements ITokenStrategy {
  generateAccessToken(payload: TokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  generateRefreshToken(payload: { userId: string }): string {
    return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
  }

  verifyAccessToken(token: string): TokenPayload {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  }

  verifyRefreshToken(token: string): { userId: string } {
    return jwt.verify(token, REFRESH_TOKEN_SECRET) as { userId: string };
  }
}

// Keep the old name as an alias for backward compatibility or ease of migration
export { JwtTokenStrategy as TokenStrategy };


import { IsJWT, IsOptional, Matches } from "class-validator";

export class RefreshDto {
  @IsJWT({ message: "Geçersiz yenileme anahtarı." })
  refreshToken: string;

  /** base64url SHA-256 of the device key (employee app). */
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{43}$/, { message: "Geçersiz cihaz kimliği." })
  deviceFingerprint?: string;
}

import { IsEmail, IsOptional, IsString, Matches, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail({}, { message: "Geçerli bir e-posta adresi girin." })
  email: string;

  @IsString()
  @MinLength(8, { message: "Şifre en az 8 karakter olmalıdır." })
  password: string;

  /** base64url SHA-256 of the device key (32 bytes → 43 chars). */
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{43}$/, { message: "Geçersiz cihaz kimliği." })
  deviceFingerprint?: string;
}

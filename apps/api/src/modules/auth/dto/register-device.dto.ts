import { IsString, Length, Matches } from "class-validator";

export class RegisterDeviceDto {
  /** 32 bytes base64url = 43 chars. */
  @Matches(/^[A-Za-z0-9_-]{43}$/, { message: "Geçersiz cihaz anahtarı formatı." })
  deviceKey: string;

  @IsString()
  @Length(1, 50)
  platform: string;

  @IsString()
  @Length(1, 100)
  model: string;
}

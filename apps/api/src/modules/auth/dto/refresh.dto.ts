import { IsJWT } from "class-validator";

export class RefreshDto {
  @IsJWT({ message: "Geçersiz yenileme anahtarı." })
  refreshToken: string;
}

import { IsEmail, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail({}, { message: "Geçerli bir e-posta adresi girin." })
  email: string;

  @IsString()
  @MinLength(8, { message: "Şifre en az 8 karakter olmalıdır." })
  password: string;
}

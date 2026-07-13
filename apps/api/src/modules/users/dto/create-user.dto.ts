import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, Length, MinLength } from "class-validator";

import { UserRole } from "@quanta/shared";

export class CreateUserDto {
  @IsEmail({}, { message: "Geçerli bir e-posta adresi girin." })
  email: string;

  @IsString()
  @MinLength(8, { message: "Şifre en az 8 karakter olmalıdır." })
  password: string;

  @IsString()
  @Length(2, 100)
  fullName: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  employeeCode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  department?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

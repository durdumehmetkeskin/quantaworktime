import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator";

import { AttendanceType } from "@quanta/shared";

const B64URL_32B = /^[A-Za-z0-9_-]{43}$/; // 32-byte HMAC
const B64URL_ANY = /^[A-Za-z0-9_-]{16,512}$/;

export class CreateChallengeDto {
  @IsUUID("4", { message: "Geçersiz tablet kimliği." })
  tabletId: string;
}

export class CheckDto {
  /** base64url-encoded QR JSON. */
  @Matches(B64URL_ANY, { message: "Geçersiz QR içeriği." })
  qrPayload: string;

  @IsUUID("4", { message: "Geçersiz challenge kimliği." })
  challengeId: string;

  @Matches(B64URL_32B, { message: "Geçersiz BLE yanıtı." })
  bleResponse: string;

  @IsEnum(AttendanceType, { message: "Tip IN veya OUT olmalıdır." })
  type: AttendanceType;

  @Matches(B64URL_32B, { message: "Geçersiz cihaz imzası." })
  deviceSignature: string;

  @IsInt()
  @Min(0)
  clientTs: number;

  /** Optional tablet echo ("challenge|nonce") used only for failure diagnostics. */
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{1,60}\|[A-Za-z0-9_-]{1,60}$/)
  bleEcho?: string;
}

export class QueryAttendanceDto {
  @IsOptional()
  @IsUUID("4")
  userId?: string;

  @IsOptional()
  @IsUUID("4")
  tabletId?: string;

  @IsOptional()
  @IsEnum(AttendanceType)
  type?: AttendanceType;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  pageSize?: number;
}

export class PatchAttendanceDto {
  @IsOptional()
  @IsISO8601({}, { message: "Geçersiz tarih formatı." })
  timestamp?: string;

  @IsOptional()
  @IsEnum(AttendanceType)
  type?: AttendanceType;

  @IsOptional()
  @IsInt()
  @Min(0)
  lateMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  earlyLeaveMinutes?: number;

  @IsString()
  @Length(3, 500, { message: "Düzeltme notu zorunludur (3-500 karakter)." })
  note: string;
}

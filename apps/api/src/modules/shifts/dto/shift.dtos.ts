import { IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from "class-validator";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateShiftDto {
  @IsString()
  @Length(2, 100)
  name: string;

  @Matches(HHMM, { message: "Başlangıç saati SS:DD formatında olmalıdır." })
  startTime: string;

  @Matches(HHMM, { message: "Bitiş saati SS:DD formatında olmalıdır." })
  endTime: string;

  @IsInt()
  @Min(0)
  @Max(120)
  graceMinutes: number;

  /** Bitmask, bit 0 = Pazartesi ... bit 6 = Pazar. */
  @IsInt()
  @Min(0)
  @Max(127)
  workDays: number;

  @IsInt()
  @Min(0)
  @Max(240)
  breakMinutes: number;
}

export class UpdateShiftDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @Matches(HHMM)
  startTime?: string;

  @IsOptional()
  @Matches(HHMM)
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  graceMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(127)
  workDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  breakMinutes?: number;
}

export class AssignShiftDto {
  @IsUUID("4")
  userId: string;

  @IsUUID("4")
  shiftId: string;

  @IsISO8601({}, { message: "Geçersiz başlangıç tarihi." })
  effectiveFrom: string;

  @IsOptional()
  @IsISO8601({}, { message: "Geçersiz bitiş tarihi." })
  effectiveTo?: string;
}

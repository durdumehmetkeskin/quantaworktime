import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";

export class ProvisionTabletDto {
  @IsString()
  @Length(2, 100)
  name: string;

  @IsString()
  @Length(2, 200)
  location: string;
}

export class UpdateTabletDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(2, 200)
  location?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ClaimTabletDto {
  @Matches(/^[A-Z0-9]{8}$/, { message: "Geçersiz kurulum kodu." })
  provisionCode: string;
}

/** Base64url of 32-byte HMAC = 43 chars. */
const HMAC_B64URL = /^[A-Za-z0-9_-]{43}$/;

export class TabletSignedDto {
  @IsInt()
  @Min(0)
  ts: number;

  @Matches(HMAC_B64URL, { message: "Geçersiz imza." })
  signature: string;
}

export class NonceItemDto {
  /** 16-byte nonce base64url = 22 chars. */
  @Matches(/^[A-Za-z0-9_-]{22}$/)
  nonce: string;

  @IsInt()
  @Min(0)
  issuedTs: number;
}

export class SyncNoncesDto extends TabletSignedDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NonceItemDto)
  nonces: NonceItemDto[];
}

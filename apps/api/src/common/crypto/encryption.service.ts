import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { decryptAes256Gcm, encryptAes256Gcm } from "./aes";

/**
 * At-rest encryption for secrets that must stay HMAC-usable in plaintext form
 * (tabletSecret, deviceKey). Server-side only — the master key never leaves
 * the API process.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    this.key = Buffer.from(config.get<string>("encryptionKeyHex")!, "hex");
  }

  encrypt(plaintext: Uint8Array): string {
    return encryptAes256Gcm(this.key, plaintext);
  }

  decrypt(stored: string): Uint8Array {
    return decryptAes256Gcm(this.key, stored);
  }
}

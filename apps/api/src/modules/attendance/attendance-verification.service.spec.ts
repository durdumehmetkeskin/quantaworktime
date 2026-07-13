import { ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import {
  AttendanceType,
  computeBleResponse,
  computeDeviceSignature,
  createQrToken,
  randomBytes,
  toBase64Url,
} from "@quanta/shared";

import { AttendanceRecord, Challenge, QrNonce, User, UserShift } from "../../entities";
import { AuditService } from "../audit/audit.service";
import { DevicesService } from "../devices/devices.service";
import { TabletsService } from "../tablets/tablets.service";
import { AttendanceVerificationService } from "./attendance-verification.service";
import type { CheckDto } from "./dto/attendance.dtos";

/**
 * Threat-model tests (spec §4). Crypto is REAL (@quanta/shared); persistence
 * is mocked. Each scenario asserts both the 403 and the audit step that
 * rejected it.
 */

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TABLET_ID = "22222222-2222-4222-8222-222222222222";
const CHALLENGE_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_USER_ID = "44444444-4444-4444-8444-444444444444";

interface Scenario {
  dto: CheckDto;
  tabletSecret: Uint8Array;
  deviceKey: Uint8Array;
  qrNonce: string;
  challengeBytes: Uint8Array;
}

function buildValidScenario(nowSec = Math.floor(Date.now() / 1000)): Scenario {
  const tabletSecret = randomBytes(32);
  const deviceKey = randomBytes(32);
  const challengeBytes = randomBytes(16);
  const { payload, token } = createQrToken(TABLET_ID, tabletSecret, nowSec);
  const challengeB64 = toBase64Url(challengeBytes);
  const bleResponse = toBase64Url(computeBleResponse(tabletSecret, challengeB64, payload.n));
  const clientTs = nowSec;
  const deviceSignature = toBase64Url(
    computeDeviceSignature(deviceKey, CHALLENGE_ID, bleResponse, clientTs),
  );
  return {
    tabletSecret,
    deviceKey,
    qrNonce: payload.n,
    challengeBytes,
    dto: {
      qrPayload: token,
      challengeId: CHALLENGE_ID,
      bleResponse,
      type: AttendanceType.IN,
      deviceSignature,
      clientTs,
    },
  };
}

describe("AttendanceVerificationService", () => {
  let service: AttendanceVerificationService;
  let scenario: Scenario;

  const users = { findOneBy: jest.fn() };
  const challenges = { findOneBy: jest.fn(), update: jest.fn(), find: jest.fn() };
  const nonces = { insert: jest.fn(), update: jest.fn(), find: jest.fn() };
  const records = { findOne: jest.fn(), save: jest.fn(), create: jest.fn() };
  const userShifts = { find: jest.fn() };
  const tabletsService = { getOrThrow: jest.fn(), getSecret: jest.fn() };
  const devicesService = { findActiveWithKey: jest.fn() };
  const audit = { log: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    scenario = buildValidScenario();

    // Happy-path defaults; individual tests break exactly one link.
    users.findOneBy.mockResolvedValue({ id: USER_ID, isActive: true });
    devicesService.findActiveWithKey.mockResolvedValue({
      device: { id: "device-1" },
      key: scenario.deviceKey,
    });
    tabletsService.getOrThrow.mockResolvedValue({ id: TABLET_ID, isActive: true });
    tabletsService.getSecret.mockReturnValue(scenario.tabletSecret);
    nonces.insert.mockResolvedValue({});
    nonces.update.mockResolvedValue({ affected: 1 });
    nonces.find.mockResolvedValue([]);
    challenges.findOneBy.mockResolvedValue({
      id: CHALLENGE_ID,
      userId: USER_ID,
      tabletId: TABLET_ID,
      challenge: Buffer.from(scenario.challengeBytes),
      expiresAt: new Date(Date.now() + 30_000),
      usedAt: null,
    });
    challenges.update.mockResolvedValue({ affected: 1 });
    challenges.find.mockResolvedValue([]);
    records.findOne.mockResolvedValue(null);
    records.create.mockImplementation((r: unknown) => r);
    records.save.mockImplementation((r: Record<string, unknown>) =>
      Promise.resolve({ ...r, id: "record-1" }),
    );
    userShifts.find.mockResolvedValue([]);
    audit.log.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AttendanceVerificationService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(Challenge), useValue: challenges },
        { provide: getRepositoryToken(QrNonce), useValue: nonces },
        { provide: getRepositoryToken(AttendanceRecord), useValue: records },
        { provide: getRepositoryToken(UserShift), useValue: userShifts },
        { provide: TabletsService, useValue: tabletsService },
        { provide: DevicesService, useValue: devicesService },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AttendanceVerificationService);
  });

  async function expectRejectedAtStep(dto: CheckDto, step: number, reason?: string) {
    await expect(service.verifyAndRecord(USER_ID, dto)).rejects.toThrow(ForbiddenException);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ATTENDANCE_CHECK_FAILED",
        detail: expect.objectContaining({ step, ...(reason ? { reason } : {}) }),
      }),
    );
    expect(records.save).not.toHaveBeenCalled();
  }

  // ------------------------------------------------------------ happy path

  it("accepts a fully valid check-in and persists the record", async () => {
    const result = await service.verifyAndRecord(USER_ID, scenario.dto);
    expect(result.id).toBe("record-1");
    expect(result.type).toBe(AttendanceType.IN);
    expect(records.save).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ATTENDANCE_CHECK_OK" }),
    );
    // single-use guarantees actually engaged:
    expect(nonces.update).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: scenario.qrNonce }),
      expect.objectContaining({ usedByUserId: USER_ID }),
    );
    expect(challenges.update).toHaveBeenCalled();
  });

  it("accepts the BLE response computed against a previous (synced) nonce", async () => {
    // tablet answered with an older nonce from its RAM window
    const oldNonce = toBase64Url(randomBytes(16));
    nonces.find.mockResolvedValue([{ nonce: oldNonce }]);
    const challengeB64 = toBase64Url(scenario.challengeBytes);
    const bleResponse = toBase64Url(
      computeBleResponse(scenario.tabletSecret, challengeB64, oldNonce),
    );
    const deviceSignature = toBase64Url(
      computeDeviceSignature(scenario.deviceKey, CHALLENGE_ID, bleResponse, scenario.dto.clientTs),
    );
    const result = await service.verifyAndRecord(USER_ID, {
      ...scenario.dto,
      bleResponse,
      deviceSignature,
    });
    expect(result.id).toBe("record-1");
  });

  // -------------------------------------------- threat 1: QR photo, no BLE

  it("THREAT: rejects a QR photo relayed to a remote phone (no BLE proof) at step 7", async () => {
    // Remote attacker has the QR and a valid challenge but cannot compute the
    // BLE response; they submit a guess signed correctly by their own device.
    const guessedBle = toBase64Url(randomBytes(32));
    const deviceSignature = toBase64Url(
      computeDeviceSignature(scenario.deviceKey, CHALLENGE_ID, guessedBle, scenario.dto.clientTs),
    );
    await expectRejectedAtStep(
      { ...scenario.dto, bleResponse: guessedBle, deviceSignature },
      7,
      "ble_response_invalid",
    );
  });

  // ------------------------------------------------- threat 2: QR replay

  it("THREAT: rejects a replayed nonce (already used) at step 5", async () => {
    nonces.update.mockResolvedValue({ affected: 0 }); // someone already claimed it
    await expectRejectedAtStep(scenario.dto, 5, "nonce_replayed");
  });

  it("THREAT: rejects an old QR outside the ±60s window at step 4", async () => {
    const old = buildValidScenario(Math.floor(Date.now() / 1000) - 61);
    devicesService.findActiveWithKey.mockResolvedValue({
      device: { id: "device-1" },
      key: old.deviceKey,
    });
    tabletsService.getSecret.mockReturnValue(old.tabletSecret);
    await expectRejectedAtStep(old.dto, 4, "qr_expired");
  });

  it("accepts a QR exactly at the 60s boundary", async () => {
    const edge = buildValidScenario(Math.floor(Date.now() / 1000) - 59);
    devicesService.findActiveWithKey.mockResolvedValue({
      device: { id: "device-1" },
      key: edge.deviceKey,
    });
    tabletsService.getSecret.mockReturnValue(edge.tabletSecret);
    challenges.findOneBy.mockResolvedValue({
      id: CHALLENGE_ID,
      userId: USER_ID,
      tabletId: TABLET_ID,
      challenge: Buffer.from(edge.challengeBytes),
      expiresAt: new Date(Date.now() + 30_000),
      usedAt: null,
    });
    const result = await service.verifyAndRecord(USER_ID, edge.dto);
    expect(result.id).toBe("record-1");
  });

  // ------------------------------------- threat 3: another employee's phone

  it("THREAT: rejects a request signed by a different device key at step 2", async () => {
    const strangerKey = randomBytes(32);
    const deviceSignature = toBase64Url(
      computeDeviceSignature(
        strangerKey,
        CHALLENGE_ID,
        scenario.dto.bleResponse,
        scenario.dto.clientTs,
      ),
    );
    await expectRejectedAtStep(
      { ...scenario.dto, deviceSignature },
      2,
      "device_signature_mismatch",
    );
  });

  it("THREAT: rejects a user with no approved device at step 2", async () => {
    devicesService.findActiveWithKey.mockResolvedValue(null);
    await expectRejectedAtStep(scenario.dto, 2, "no_active_device");
  });

  // --------------------------------------------- threat 4: challenge reuse

  it("THREAT: rejects a challenge that was already consumed at step 6", async () => {
    challenges.update.mockResolvedValue({ affected: 0 });
    await expectRejectedAtStep(scenario.dto, 6, "challenge_expired_or_used");
  });

  it("THREAT: rejects a challenge issued to a different user at step 6", async () => {
    challenges.findOneBy.mockResolvedValue({
      id: CHALLENGE_ID,
      userId: OTHER_USER_ID,
      tabletId: TABLET_ID,
      challenge: Buffer.from(scenario.challengeBytes),
      expiresAt: new Date(Date.now() + 30_000),
      usedAt: null,
    });
    await expectRejectedAtStep(scenario.dto, 6, "challenge_not_owned");
  });

  // ----------------------------------------------- threat 5: fake tablet

  it("THREAT: rejects a QR signed by a fake tablet (wrong secret) at step 3", async () => {
    const fakeSecret = randomBytes(32);
    const fake = createQrToken(TABLET_ID, fakeSecret, Math.floor(Date.now() / 1000));
    const challengeB64 = toBase64Url(scenario.challengeBytes);
    const bleResponse = toBase64Url(computeBleResponse(fakeSecret, challengeB64, fake.payload.n));
    const deviceSignature = toBase64Url(
      computeDeviceSignature(scenario.deviceKey, CHALLENGE_ID, bleResponse, scenario.dto.clientTs),
    );
    await expectRejectedAtStep(
      { ...scenario.dto, qrPayload: fake.token, bleResponse, deviceSignature },
      3,
      "qr_signature_invalid",
    );
  });

  // ------------------------------------------------------- other failures

  it("rejects an inactive user at step 1", async () => {
    users.findOneBy.mockResolvedValue({ id: USER_ID, isActive: false });
    await expectRejectedAtStep(scenario.dto, 1, "user_inactive");
  });

  it("rejects a duplicate check within 60s at step 8", async () => {
    records.findOne.mockResolvedValue({ id: "recent-record" });
    await expectRejectedAtStep(scenario.dto, 8, "duplicate_within_window");
  });

  it("rejects malformed QR payloads at step 3", async () => {
    await expectRejectedAtStep({ ...scenario.dto, qrPayload: "not-a-valid-token" }, 3);
  });
});

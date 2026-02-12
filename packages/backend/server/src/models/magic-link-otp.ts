import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';

import { CryptoHelper } from '../base';
import { BaseModel } from './base';

const MAX_OTP_ATTEMPTS = 10;
const OTP_TTL_IN_SEC = 30 * 60;

export type ConsumeMagicLinkOtpResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'invalid_otp' | 'locked' }
  | { ok: false; reason: 'nonce_mismatch' };

@Injectable()
export class MagicLinkOtpModel extends BaseModel {
  constructor(private readonly crypto: CryptoHelper) {
    super();
  }

  private hash(otp: string) {
    return this.crypto.sha256(otp).toString('hex');
  }

  async upsert(
    email: string,
    otp: string,
    token: string,
    clientNonce?: string
  ) {
    const otpHash = this.hash(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_IN_SEC * 1000);

    await this.db.magicLinkOtp.upsert({
      where: { email },
      create: { email, otpHash, token, clientNonce, expiresAt, attempts: 0 },
      update: { otpHash, token, clientNonce, expiresAt, attempts: 0 },
    });
  }

  @Transactional()
  async consume(
    email: string,
    otp: string,
    clientNonce?: string
  ): Promise<ConsumeMagicLinkOtpResult> {
    const now = new Date();
    const otpHash = this.hash(otp);

    const record = await this.db.magicLinkOtp.findUnique({ where: { email } });
    if (!record) {
      return { ok: false, reason: 'not_found' };
    }

    if (record.expiresAt <= now) {
      await this.db.magicLinkOtp.delete({ where: { email } });
      return { ok: false, reason: 'expired' };
    }

    if (record.clientNonce && record.clientNonce !== clientNonce) {
      return { ok: false, reason: 'nonce_mismatch' };
    }

    if (record.attempts >= MAX_OTP_ATTEMPTS) {
      await this.db.magicLinkOtp.delete({ where: { email } });
      return { ok: false, reason: 'locked' };
    }

    const matches = this.crypto.compare(record.otpHash, otpHash);
    if (!matches) {
      const attempts = record.attempts + 1;
      if (attempts >= MAX_OTP_ATTEMPTS) {
        await this.db.magicLinkOtp.delete({ where: { email } });
        return { ok: false, reason: 'locked' };
      }
      await this.db.magicLinkOtp.update({
        where: { email },
        data: { attempts },
      });
      return { ok: false, reason: 'invalid_otp' };
    }

    await this.db.magicLinkOtp.delete({ where: { email } });
    return { ok: true, token: record.token };
  }
}

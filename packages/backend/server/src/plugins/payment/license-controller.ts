import { randomUUID } from 'node:crypto';

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';

import {
  CustomerPortalCreateFailed,
  InvalidLicenseToActivate,
  InvalidLicenseUpdateParams,
  LicenseNotFound,
} from '../../base';
import { Public } from '../../core/auth';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { SubscriptionRecurring } from './types';

const UpdateSeatsParams = z.object({ seats: z.number().int().positive() });
const UpdateRecurringParams = z.object({
  recurring: z.enum([
    SubscriptionRecurring.Monthly,
    SubscriptionRecurring.Yearly,
  ]),
});
const ActivateParams = z.object({
  workspaceId: z.string().min(1),
  operationId: z.string().uuid(),
});
const ValidateKey = z.string().uuid();

interface LicenseEnvelope {
  license: string;
  validateKey: string;
  recurring: string;
}

@Public()
@Controller('/api/team/licenses')
export class LicenseController {
  constructor(private readonly runtime: BackendRuntimeProvider) {}

  @Post('/:license/activate')
  async activate(
    @Res() response: Response,
    @Param('license') licenseKey: string,
    @Body() body: unknown
  ) {
    const input = ActivateParams.safeParse(body);
    if (!input.success) {
      throw new InvalidLicenseToActivate({ reason: 'Invalid workspace.' });
    }
    try {
      const result =
        await this.runtime.executePaymentCommandV1<LicenseEnvelope>({
          action: 'activate_license',
          licenseKey,
          workspaceId: input.data.workspaceId,
          operationId: input.data.operationId,
        });
      sendLicense(response, result);
    } catch (error) {
      throw licenseError(error);
    }
  }

  @Post('/:license/deactivate')
  async deactivate(
    @Param('license') licenseKey: string,
    @Headers('x-validate-key') validateKey: string
  ) {
    if (!ValidateKey.safeParse(validateKey).success) {
      throw new InvalidLicenseToActivate({ reason: 'Invalid validate key' });
    }
    return this.runtime.executePaymentCommandV1({
      action: 'deactivate_license',
      licenseKey,
      validateKey,
    });
  }

  @Get('/:license/health')
  async health(
    @Res() response: Response,
    @Param('license') licenseKey: string,
    @Headers('x-validate-key') validateKey: string
  ) {
    try {
      const result =
        await this.runtime.executePaymentCommandV1<LicenseEnvelope>({
          action: 'check_license_health',
          licenseKey,
          validateKey,
        });
      sendLicense(response, result);
    } catch (error) {
      throw licenseError(error);
    }
  }

  @Post('/:license/seats')
  async updateSeats(
    @Param('license') licenseKey: string,
    @Headers('x-validate-key') validateKey: string,
    @Body() body: unknown
  ) {
    const input = UpdateSeatsParams.safeParse(body);
    if (!input.success) {
      throw new InvalidLicenseUpdateParams({ reason: input.error.message });
    }
    if (!ValidateKey.safeParse(validateKey).success) {
      throw new InvalidLicenseUpdateParams({ reason: 'Invalid validate key' });
    }
    try {
      await this.runtime.executePaymentCommandV1({
        action: 'update_quantity',
        validateKey,
        targetType: 'instance',
        targetId: licenseKey,
        plan: 'selfhost_team',
        quantity: input.data.seats,
        intentId: randomUUID(),
      });
    } catch (error) {
      throw new InvalidLicenseUpdateParams({ reason: errorMessage(error) });
    }
  }

  @Post('/:license/recurring')
  async updateRecurring(
    @Param('license') licenseKey: string,
    @Headers('x-validate-key') validateKey: string,
    @Body() body: unknown
  ) {
    const input = UpdateRecurringParams.safeParse(body);
    if (!input.success) {
      throw new InvalidLicenseUpdateParams({ reason: input.error.message });
    }
    if (!ValidateKey.safeParse(validateKey).success) {
      throw new InvalidLicenseUpdateParams({ reason: 'Invalid validate key' });
    }
    try {
      await this.runtime.executePaymentCommandV1({
        action: 'update_recurring',
        validateKey,
        targetType: 'instance',
        targetId: licenseKey,
        plan: 'selfhost_team',
        recurring: input.data.recurring,
        intentId: randomUUID(),
      });
    } catch (error) {
      throw new InvalidLicenseUpdateParams({ reason: errorMessage(error) });
    }
  }

  @Post('/:license/create-customer-portal')
  async createCustomerPortal(
    @Param('license') licenseKey: string,
    @Headers('x-validate-key') validateKey: string
  ) {
    if (!ValidateKey.safeParse(validateKey).success) {
      throw new CustomerPortalCreateFailed();
    }
    try {
      const url = await this.runtime.createLicenseCustomerPortalV1(
        licenseKey,
        validateKey
      );
      return { url };
    } catch {
      throw new CustomerPortalCreateFailed();
    }
  }
}

function sendLicense(response: Response, result: LicenseEnvelope) {
  response
    .status(HttpStatus.OK)
    .header('x-next-validate-key', result.validateKey)
    .header('x-license-recurring', result.recurring)
    .send(Buffer.from(result.license, 'base64'));
}

function licenseError(error: unknown) {
  const message = errorMessage(error);
  if (message.includes('license_not_found')) return new LicenseNotFound();
  if (message.includes('invalid_validate_key')) {
    return new InvalidLicenseToActivate({ reason: 'Invalid validate key' });
  }
  return new InvalidLicenseToActivate({ reason: 'Invalid license' });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

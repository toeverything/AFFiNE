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
  InternalServerError,
  InvalidLicenseToActivate,
  InvalidLicenseUpdateParams,
  LicenseExpired,
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
const HealthParams = z.object({ workspaceId: z.string().min(1) });

interface LicenseEnvelope {
  license: string;
  validateKey: string;
  recurring: string;
}

@Public()
@Controller('/api/team/v1/licenses')
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
    try {
      return await this.runtime.executePaymentCommandV1({
        action: 'deactivate_license',
        licenseKey,
        validateKey,
      });
    } catch (error) {
      throw licenseError(error);
    }
  }

  @Post('/:license/health')
  async health(
    @Res() response: Response,
    @Param('license') licenseKey: string,
    @Headers('x-validate-key') validateKey: string,
    @Body() body: unknown
  ) {
    const input = HealthParams.safeParse(body);
    if (!input.success || !ValidateKey.safeParse(validateKey).success) {
      throw new InvalidLicenseToActivate({ reason: 'Invalid license request' });
    }
    try {
      const result =
        await this.runtime.executePaymentCommandV1<LicenseEnvelope>({
          action: 'check_license_health',
          licenseKey,
          validateKey,
          workspaceId: input.data.workspaceId,
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
      throw licenseError(error);
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
      throw licenseError(error);
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
    } catch (error) {
      throw licenseError(error);
    }
  }
}

// Remove with support for v0.27.4 clients. Native authorization restricts these
// key-only operations to licenses that have not acquired a workspace binding.
@Public()
@Controller('/api/team/licenses')
export class LegacyLicenseController {
  constructor(private readonly runtime: BackendRuntimeProvider) {}

  @Post('/:license/activate')
  async activate(
    @Res() response: Response,
    @Param('license') licenseKey: string
  ) {
    await this.sendLicense(response, {
      action: 'activate_legacy_license',
      licenseKey,
    });
  }

  @Get('/:license/health')
  async health(
    @Res() response: Response,
    @Param('license') licenseKey: string,
    @Headers('x-validate-key') validateKey: string
  ) {
    await this.sendLicense(response, {
      action: 'check_legacy_license_health',
      licenseKey,
      validateKey,
    });
  }

  @Post('/:license/deactivate')
  async deactivate(@Param('license') licenseKey: string) {
    try {
      return await this.runtime.executePaymentCommandV1({
        action: 'deactivate_legacy_license',
        licenseKey,
      });
    } catch (error) {
      throw licenseError(error);
    }
  }

  @Post('/:license/seats')
  async updateSeats(
    @Param('license') licenseKey: string,
    @Body() body: unknown
  ) {
    const input = UpdateSeatsParams.safeParse(body);
    if (!input.success) {
      throw new InvalidLicenseUpdateParams({ reason: input.error.message });
    }
    try {
      await this.runtime.executePaymentCommandV1({
        action: 'update_quantity',
        targetType: 'instance',
        targetId: licenseKey,
        plan: 'selfhost_team',
        quantity: input.data.seats,
        intentId: randomUUID(),
      });
    } catch (error) {
      throw licenseError(error);
    }
  }

  @Post('/:license/recurring')
  async updateRecurring(
    @Param('license') licenseKey: string,
    @Body() body: unknown
  ) {
    const input = UpdateRecurringParams.safeParse(body);
    if (!input.success) {
      throw new InvalidLicenseUpdateParams({ reason: input.error.message });
    }
    try {
      await this.runtime.executePaymentCommandV1({
        action: 'update_recurring',
        targetType: 'instance',
        targetId: licenseKey,
        plan: 'selfhost_team',
        recurring: input.data.recurring,
        intentId: randomUUID(),
      });
    } catch (error) {
      throw licenseError(error);
    }
  }

  @Post('/:license/create-customer-portal')
  async createCustomerPortal(@Param('license') licenseKey: string) {
    try {
      return {
        url: await this.runtime.createLicenseCustomerPortalV1(licenseKey),
      };
    } catch (error) {
      throw licenseError(error);
    }
  }

  private async sendLicense(
    response: Response,
    command: Record<string, unknown>
  ) {
    try {
      const result = await this.runtime.executePaymentCommandV1<{
        validateKey: string;
        license: {
          plan: string;
          recurring: string;
          quantity: number;
          endAt: number;
        };
      }>(command);
      response
        .status(HttpStatus.OK)
        .header('x-next-validate-key', result.validateKey)
        .json(result.license);
    } catch (error) {
      throw licenseError(error);
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
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'license_not_found') return new LicenseNotFound();
  if (message === 'license_expired') return new LicenseExpired();
  if (
    [
      'cant_update_onetime_subscription',
      'subscription_already_canceled',
      'same_subscription_recurring',
    ].includes(message)
  ) {
    return new InvalidLicenseUpdateParams({ reason: message });
  }
  if (
    [
      'invalid_license',
      'invalid_validate_key',
      'license_unbound',
      'license_workspace_mismatch',
      'license_upgrade_required',
      'license_protocol_upgraded',
    ].includes(message)
  ) {
    return new InvalidLicenseToActivate({ reason: message });
  }
  return new InternalServerError('License service is temporarily unavailable.');
}

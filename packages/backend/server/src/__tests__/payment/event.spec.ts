import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { CryptoHelper, EventBus } from '../../base';
import { EntitlementService } from '../../core/entitlement';
import { WorkspacePolicyService } from '../../core/permission';
import { QuotaStateService } from '../../core/quota/state';
import { WorkspaceService } from '../../core/workspaces';
import { Models } from '../../models';
import { LicenseService } from '../../plugins/license/service';
import { PaymentEventHandlers } from '../../plugins/payment/event';
import {
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionVariant,
} from '../../plugins/payment/types';

type Context = Record<string, never>;

const test = ava as TestFn<Context>;

test('workspace subscription activation only sends upgrade notification', async t => {
  const events: Array<{ name: string; payload: unknown }> = [];
  let reconciled = false;
  const handler = new PaymentEventHandlers(
    {
      isTeamWorkspace: async () => true,
      sendTeamWorkspaceUpgradedEmail: async () => {},
    } as unknown as WorkspaceService,
    {
      reconcileWorkspaceQuotaState: async () => {
        reconciled = true;
      },
    } as unknown as WorkspacePolicyService,
    {
      reconcileWorkspaceQuotaState: async () => ({ seatLimit: 7 }),
    } as unknown as QuotaStateService,
    {
      emit: (name: string, payload: unknown) => events.push({ name, payload }),
    } as unknown as EventBus
  );

  await handler.onWorkspaceSubscriptionUpdated({
    workspaceId: 'ws',
    plan: SubscriptionPlan.Team,
    recurring: SubscriptionRecurring.Yearly,
    quantity: 999,
  });

  t.deepEqual(events, []);
  t.false(reconciled);
});

test('workspace entitlement change allocates seats from effective quota state', async t => {
  const events: Array<{ name: string; payload: unknown }> = [];
  const handler = new PaymentEventHandlers(
    {} as unknown as WorkspaceService,
    {} as unknown as WorkspacePolicyService,
    {
      reconcileWorkspaceQuotaState: async () => ({
        plan: 'team',
        seatLimit: 7,
      }),
    } as unknown as QuotaStateService,
    {
      emit: (name: string, payload: unknown) => events.push({ name, payload }),
    } as unknown as EventBus
  );

  await handler.onEntitlementChanged({
    targetType: 'workspace',
    targetId: 'ws',
  });

  t.deepEqual(events, [
    {
      name: 'workspace.members.allocateSeats',
      payload: { workspaceId: 'ws', quantity: 7 },
    },
  ]);
});

test('onetime selfhost license seat allocation ignores projected license quantity', async t => {
  const events: Array<{ name: string; payload: unknown }> = [];
  const service = new LicenseService(
    {
      installedLicense: {
        findUnique: async () => ({
          key: 'license-key',
          workspaceId: 'ws',
          quantity: 999,
          recurring: SubscriptionRecurring.Yearly,
          variant: SubscriptionVariant.Onetime,
        }),
      },
    } as unknown as PrismaClient,
    {
      emit: (name: string, payload: unknown) => events.push({ name, payload }),
    } as unknown as EventBus,
    {} as unknown as Models,
    {} as unknown as CryptoHelper,
    {} as unknown as WorkspacePolicyService,
    {} as unknown as EntitlementService,
    {
      reconcileWorkspaceQuotaState: async () => ({ seatLimit: 4 }),
    } as unknown as QuotaStateService
  );

  await service.updateTeamSeats({
    workspaceId: 'ws',
  } as Events['workspace.members.updated']);

  t.deepEqual(events, [
    {
      name: 'workspace.members.allocateSeats',
      payload: { workspaceId: 'ws', quantity: 4 },
    },
  ]);
});

test('recurring selfhost license activation returns activation projection without remote health recheck', async t => {
  const events: Array<{ name: string; payload: unknown }> = [];
  const affineProRequests: string[] = [];
  const upserts: unknown[] = [];
  const entitlements: unknown[] = [];
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const service = new LicenseService(
    {
      installedLicense: {
        findUnique: async () => null,
        upsert: async (input: unknown) => {
          upserts.push(input);
          return {
            workspaceId: 'ws',
            key: 'license-key',
            quantity: 3,
            recurring: SubscriptionRecurring.Monthly,
            variant: null,
          };
        },
      },
    } as unknown as PrismaClient,
    {
      emit: (name: string, payload: unknown) => events.push({ name, payload }),
    } as unknown as EventBus,
    {} as unknown as Models,
    {} as unknown as CryptoHelper,
    {} as unknown as WorkspacePolicyService,
    {
      upsertFromValidatedSelfhostLicense: async (input: unknown) => {
        entitlements.push(input);
      },
    } as unknown as EntitlementService,
    {} as unknown as QuotaStateService
  );

  (
    service as unknown as {
      fetchAffinePro: (path: string) => Promise<{
        plan: SubscriptionPlan;
        recurring: SubscriptionRecurring;
        quantity: number;
        endAt: number;
        res: Response;
      }>;
    }
  ).fetchAffinePro = async (path: string) => {
    affineProRequests.push(path);
    return {
      plan: SubscriptionPlan.SelfHostedTeam,
      recurring: SubscriptionRecurring.Monthly,
      quantity: 3,
      endAt: expiresAt,
      res: new Response(null, {
        headers: {
          'x-next-validate-key': 'next-validate-key',
        },
      }),
    };
  };

  const license = await service.activateTeamLicense('ws', 'license-key');

  t.like(license, {
    workspaceId: 'ws',
    key: 'license-key',
    quantity: 3,
    recurring: SubscriptionRecurring.Monthly,
  });
  t.is(entitlements.length, 1);
  t.is(upserts.length, 1);
  t.deepEqual(affineProRequests, ['/api/team/licenses/license-key/activate']);
  t.deepEqual(events, [
    {
      name: 'workspace.subscription.activated',
      payload: {
        workspaceId: 'ws',
        plan: SubscriptionPlan.SelfHostedTeam,
        recurring: SubscriptionRecurring.Monthly,
        quantity: 3,
      },
    },
  ]);
});

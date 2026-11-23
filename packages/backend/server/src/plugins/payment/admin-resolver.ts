import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Args,
  Field,
  InputType,
  Mutation,
  ObjectType,
  Query,
  registerEnumType,
  Resolver,
} from '@nestjs/graphql';
import { z } from 'zod';

import { Throttle } from '../../base';
import { CurrentUser } from '../../core/auth';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { Admin } from '../../core/common';

enum AdminPaymentPlanFamily {
  Pro = 'pro',
  AI = 'ai',
}

registerEnumType(AdminPaymentPlanFamily, { name: 'AdminPaymentPlanFamily' });

@ObjectType()
class AdminPaymentSource {
  @Field()
  id!: string;

  @Field()
  provider!: string;

  @Field(() => String, { nullable: true })
  providerNamespace?: string;

  @Field(() => String, { nullable: true })
  sourceIdentity?: string;

  @Field(() => String, { nullable: true })
  externalCustomerId?: string;

  @Field(() => String, { nullable: true })
  externalSubscriptionId?: string;

  @Field(() => String, { nullable: true })
  externalRef?: string;

  @Field()
  status!: string;
}

@ObjectType()
class AdminPaymentAttempt {
  @Field()
  id!: string;

  @Field()
  provider!: string;

  @Field()
  providerNamespace!: string;

  @Field()
  status!: string;

  @Field(() => String, { nullable: true })
  productId?: string;

  @Field(() => String, { nullable: true })
  transactionId?: string;

  @Field(() => String, { nullable: true })
  sessionId?: string;
}

@ObjectType()
class AdminPaymentBinding {
  @Field()
  userId!: string;

  @Field(() => AdminPaymentPlanFamily)
  planFamily!: AdminPaymentPlanFamily;

  @Field()
  conflicted!: boolean;

  @Field(() => String, { nullable: true })
  boundProviderNamespace?: string;

  @Field(() => String, { nullable: true })
  boundSourceIdentity?: string;
}

@ObjectType()
class AdminPaymentCase extends AdminPaymentBinding {
  @Field(() => [AdminPaymentSource])
  sources!: AdminPaymentSource[];

  @Field(() => [AdminPaymentAttempt])
  attempts!: AdminPaymentAttempt[];
}

enum AdminPaymentResolutionStatus {
  Resolved = 'resolved',
  Pending = 'pending',
}

registerEnumType(AdminPaymentResolutionStatus, {
  name: 'AdminPaymentResolutionStatus',
});

@ObjectType()
class AdminPaymentResolution extends AdminPaymentBinding {
  @Field()
  requestId!: string;

  @Field(() => AdminPaymentResolutionStatus)
  status!: AdminPaymentResolutionStatus;

  @Field(() => String, { nullable: true })
  reason?: string;

  @Field(() => String, { nullable: true })
  attemptId?: string;

  @Field(() => String, { nullable: true })
  attemptStatus?: string;
}

@InputType()
class AdminPaymentLookupInput {
  @Field(() => String, { nullable: true })
  userId?: string;

  @Field(() => AdminPaymentPlanFamily, { nullable: true })
  planFamily?: AdminPaymentPlanFamily;

  @Field(() => String, { nullable: true })
  providerIdentity?: string;
}

@InputType()
class ReconcileAdminPaymentInput {
  @Field()
  userId!: string;

  @Field(() => AdminPaymentPlanFamily)
  planFamily!: AdminPaymentPlanFamily;

  @Field()
  requestId!: string;

  @Field()
  evidence!: string;

  @Field(() => String, { nullable: true })
  attemptId?: string;

  @Field(() => String, { nullable: true })
  transactionId?: string;
}

const identifier = z.string().trim().min(1).max(256);
const optionalIdentifier = identifier
  .nullish()
  .transform(value => value ?? undefined);
const lookupInput = z
  .object({
    userId: optionalIdentifier,
    planFamily: z.nativeEnum(AdminPaymentPlanFamily).nullish(),
    providerIdentity: optionalIdentifier,
  })
  .refine(({ userId, providerIdentity }) => userId || providerIdentity);
const reconcileInput = z
  .object({
    userId: identifier,
    planFamily: z.nativeEnum(AdminPaymentPlanFamily),
    requestId: identifier,
    evidence: z.string().trim().min(1).max(4000),
    attemptId: optionalIdentifier,
    transactionId: optionalIdentifier,
  })
  .refine(({ attemptId, transactionId }) => !transactionId || attemptId);

@Injectable()
@Admin()
@Resolver()
export class AdminPaymentResolver {
  constructor(private readonly runtime: BackendRuntimeProvider) {}

  private assertCloudOnly() {
    if (env.selfhosted) {
      throw new NotFoundException();
    }
  }

  @Query(() => [AdminPaymentCase])
  async adminPaymentReconciliation(
    @Args('input') input: AdminPaymentLookupInput
  ) {
    this.assertCloudOnly();
    const parsed = lookupInput.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(
        'Provide an account ID or provider identity.'
      );
    }
    const { cases } = await this.runtime.executePaymentCommandV1<{
      cases: AdminPaymentCase[];
    }>({ action: 'inspect_payment_reconciliation', ...parsed.data });
    return cases;
  }

  @Throttle('strict')
  @Mutation(() => AdminPaymentResolution)
  async reconcileAdminPayment(
    @CurrentUser() actor: CurrentUser,
    @Args('input') input: ReconcileAdminPaymentInput
  ) {
    this.assertCloudOnly();
    const parsed = reconcileInput.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(
        'Provide a valid payment case and evidence.'
      );
    }
    return this.runtime.executePaymentCommandV1<AdminPaymentResolution>({
      action: 'reconcile_payment',
      ...parsed.data,
      actorUserId: actor.id,
    });
  }
}

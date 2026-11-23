import {
  Args,
  Field,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';

import { Admin } from '../common';
import { CurrentUser, type CurrentUser as CurrentUserType } from './session';
import { AuthSigningKeyRing } from './signing-key';

@ObjectType()
class AuthSigningKeyType {
  @Field()
  id!: string;

  @Field()
  status!: string;

  @Field()
  source!: string;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => Date, { nullable: true })
  retiredAt?: Date;

  @Field(() => Date, { nullable: true })
  verifyUntil?: Date;

  @Field()
  canDelete!: boolean;
}

@Admin()
@Resolver(() => AuthSigningKeyType)
export class AuthSigningKeyResolver {
  constructor(private readonly signingKeys: AuthSigningKeyRing) {}

  @Query(() => [AuthSigningKeyType])
  async authSigningKeys() {
    return await this.signingKeys.metadata();
  }

  @Mutation(() => [AuthSigningKeyType])
  async rotateAuthSigningKey(
    @CurrentUser() me: CurrentUserType,
    @Args('expectedActiveKeyId') expectedActiveKeyId: string
  ) {
    return await this.signingKeys.rotate(me.id, expectedActiveKeyId);
  }

  @Mutation(() => [AuthSigningKeyType])
  async deleteAuthSigningKey(
    @CurrentUser() me: CurrentUserType,
    @Args('id') id: string
  ) {
    return await this.signingKeys.delete(me.id, id);
  }
}

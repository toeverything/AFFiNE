import { Field, ObjectType } from '@nestjs/graphql';
import { GraphQLJSONObject } from 'graphql-scalars';

@ObjectType()
export class AccessToken {
  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field()
  createdAt!: Date;

  @Field(() => Date, { nullable: true })
  expiresAt!: Date | null;

  @Field(() => GraphQLJSONObject, { nullable: true })
  scopes!: unknown;
}

@ObjectType()
export class RevealedAccessToken extends AccessToken {
  @Field()
  token!: string;
}

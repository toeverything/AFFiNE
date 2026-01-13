import { Field, ObjectType } from '@nestjs/graphql';

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
}

@ObjectType()
export class RevealedAccessToken extends AccessToken {
  @Field()
  token!: string;
}

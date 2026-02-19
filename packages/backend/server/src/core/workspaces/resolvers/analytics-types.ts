import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export enum TimeBucket {
  Minute = 'Minute',
  Day = 'Day',
}

registerEnumType(TimeBucket, {
  name: 'TimeBucket',
});

@ObjectType()
export class TimeWindow {
  @Field(() => Date)
  from!: Date;

  @Field(() => Date)
  to!: Date;

  @Field(() => String)
  timezone!: string;

  @Field(() => TimeBucket)
  bucket!: TimeBucket;

  @Field(() => Int)
  requestedSize!: number;

  @Field(() => Int)
  effectiveSize!: number;
}

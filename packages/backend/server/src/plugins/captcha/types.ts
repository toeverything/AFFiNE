import { Field, ObjectType } from '@nestjs/graphql';

export interface CaptchaConfig {
  turnstile: {
    /**
     * Cloudflare Turnstile CAPTCHA secret
     * default value is demo api key, witch always return success
     */
    secret: string;
  };
  challenge: {
    /**
     * challenge bits length
     * default value is 20, which can resolve in 0.5-3 second in M2 MacBook Air in single thread
     * @default 20
     */
    bits: number;
  };
}

@ObjectType()
export class ChallengeResponse {
  @Field()
  challenge!: string;

  @Field()
  resource!: string;
}

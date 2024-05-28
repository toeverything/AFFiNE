import { BadRequestException } from '@nestjs/common';
import z from 'zod';

function assertValid<T>(z: z.ZodType<T>, value: unknown) {
  const result = z.safeParse(value);

  if (!result.success) {
    const firstIssue = result.error.issues.at(0);
    if (firstIssue) {
      throw new BadRequestException(firstIssue.message);
    } else {
      throw new BadRequestException('Invalid credential');
    }
  }
}

export function assertValidEmail(email: string) {
  assertValid(z.string().email({ message: 'Invalid email address' }), email);
}

export function assertValidPassword(
  password: string,
  { min, max }: { min: number; max: number }
) {
  assertValid(
    z
      .string()
      .min(min, { message: `Password must be ${min} or more charactors long` })
      .max(max, {
        message: `Password must be ${max} or fewer charactors long`,
      }),
    password
  );
}

export const validators = {
  assertValidEmail,
  assertValidPassword,
};

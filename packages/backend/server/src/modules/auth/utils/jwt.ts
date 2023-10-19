import { randomUUID } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';
import { Algorithm, sign, verify as jwtVerify } from '@node-rs/jsonwebtoken';
import { JWT } from 'next-auth/jwt';

import { Config } from '../../../config';
import { PrismaService } from '../../../prisma';
import { getUtcTimestamp, UserClaim } from '../service';

export const jwtEncode = async (
  config: Config,
  prisma: PrismaService,
  token: JWT | undefined,
  maxAge: number | undefined
) => {
  if (!token?.email) {
    throw new BadRequestException('Missing email in jwt token');
  }
  const user = await prisma.user.findFirstOrThrow({
    where: {
      email: token.email,
    },
  });
  const now = getUtcTimestamp();
  return sign(
    {
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified?.toISOString(),
        picture: user.avatarUrl,
        createdAt: user.createdAt.toISOString(),
        hasPassword: Boolean(user.password),
      },
      iat: now,
      exp: now + (maxAge ?? config.auth.accessTokenExpiresIn),
      iss: config.serverId,
      sub: user.id,
      aud: user.name,
      jti: randomUUID({
        disableEntropyCache: true,
      }),
    },
    config.auth.privateKey,
    {
      algorithm: Algorithm.ES256,
    }
  );
};

export const jwtDecode = async (config: Config, token: string | undefined) => {
  if (!token) {
    return null;
  }
  const { name, email, emailVerified, id, picture, hasPassword } = (
    await jwtVerify(token, config.auth.publicKey, {
      algorithms: [Algorithm.ES256],
      iss: [config.serverId],
      leeway: config.auth.leeway,
      requiredSpecClaims: ['exp', 'iat', 'iss', 'sub'],
    })
  ).data as Omit<UserClaim, 'avatarUrl'> & {
    picture: string | undefined;
  };
  return {
    name,
    email,
    emailVerified,
    picture,
    sub: id,
    id,
    hasPassword,
  };
};

import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { Transaction } from '../../fundamentals';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaClient) {}

  async findUserByEmail(email: string, tx?: Transaction) {
    const executor = tx ?? this.prisma;
    return executor.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
    });
  }

  async findUserById(id: string) {
    return this.prisma.user
      .findUnique({
        where: { id },
      })
      .catch(() => {
        return null;
      });
  }

  async deleteUser(id: string) {
    return this.prisma.user.delete({ where: { id } });
  }
}

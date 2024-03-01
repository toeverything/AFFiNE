import { Injectable } from '@nestjs/common';
import { InjectTransaction, type Transaction } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';

@Injectable()
export class UsersService {
  constructor(
    // private readonly prisma: PrismaClient,
    @InjectTransaction()
    private readonly prisma: Transaction<TransactionalAdapterPrisma>
  ) {}

  async findUserByEmail(email: string) {
    return this.prisma.user.findFirst({
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

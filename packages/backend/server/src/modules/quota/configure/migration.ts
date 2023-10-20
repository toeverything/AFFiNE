import { FeatureService, PrismaService } from '.';

export async function migrateNewFeatureTable(
  feature: FeatureService,
  prisma: PrismaService
) {
  const waitingList = await prisma.newFeaturesWaitingList.findMany();
  for (const oldUser of waitingList) {
    const user = await prisma.user.findFirst({
      where: {
        email: oldUser.email,
      },
    });
    if (user) {
      const hasEarlyAccess = await prisma.userFeatureGates.count({
        where: {
          userId: user.id,
          feature: {
            feature: 'early_access',
          },
        },
      });
      if (hasEarlyAccess === 0) {
        await feature.addUserFeature(
          user.id,
          'early_access',
          1,
          'Early access user'
        );
      }
    }
  }
}

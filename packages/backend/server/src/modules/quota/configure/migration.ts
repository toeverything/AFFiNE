import { FeatureService, PrismaService } from '.';
import { FeatureType } from './types';

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
      const hasEarlyAccess = await prisma.userFeatures.count({
        where: {
          userId: user.id,
          feature: {
            feature: FeatureType.Feature_EarlyAccess,
          },
          activated: true,
        },
      });
      if (hasEarlyAccess === 0) {
        await feature.addUserFeature(
          user.id,
          FeatureType.Feature_EarlyAccess,
          1,
          'Early access user'
        );
      }
    }
  }
}

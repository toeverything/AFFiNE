import type { PricesQuery } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';

export const useAffineAIPrice = (price: PricesQuery['prices'][number]) => {
  const t = useAFFiNEI18N();

  assertExists(price.yearlyAmount, 'AFFiNE AI yearly price is missing');

  const priceReadable = `$${(price.yearlyAmount / 100).toFixed(2)}`;
  const priceFrequency = t['com.affine.payment.billing-setting.year']();

  return { priceReadable, priceFrequency };
};

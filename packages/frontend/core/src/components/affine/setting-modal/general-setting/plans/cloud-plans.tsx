// TODO: we don't handle i18n for now
// it's better to manage all equity at server side
import { SubscriptionPlan, SubscriptionRecurring } from '@affine/graphql';
import { AfFiNeIcon } from '@blocksuite/icons';
import type { ReactNode } from 'react';

export type Benefits = Record<
  string,
  Array<{
    icon?: ReactNode;
    title: ReactNode;
  }>
>;
interface BasePrice {
  plan: SubscriptionPlan;
  name: string;
  description: string;
  benefits: Benefits;
}
export interface FixedPrice extends BasePrice {
  type: 'fixed';
  price: string;
  yearlyPrice: string;
  discount?: string;
  titleRenderer: (
    recurring: SubscriptionRecurring,
    detail: FixedPrice
  ) => ReactNode;
}

export interface DynamicPrice extends BasePrice {
  type: 'dynamic';
  contact: boolean;
  titleRenderer: (
    recurring: SubscriptionRecurring,
    detail: DynamicPrice
  ) => ReactNode;
}

const freeBenefits: Benefits = {
  'Include in FOSS': [
    { title: 'Unlimited Local Workspaces.' },
    { title: 'Unlimited use and Customization.' },
    { title: 'Unlimited Doc and Edgeless editing.' },
  ],
  'Include in Basic': [
    { title: '10 GB of Cloud Storage.' },
    { title: '10 MB of Maximum file size.' },
    { title: 'Up to 3 members per Workspace.' },
    { title: '7-days Cloud Time Machine file version history.' },
    { title: 'Up to 3 login devices.' },
  ],
};

const proBenefits: Benefits = {
  'Include in Pro': [
    { title: 'Everything in AFFiNE FOSS & Basic.', icon: <AfFiNeIcon /> },
    { title: '100 GB of Cloud Storage.' },
    { title: '100 MB of Maximum file size.' },
    { title: 'Up to 10 members per Workspace.' },
    { title: '30-days Cloud Time Machine file version history.' },
    { title: 'Add comments on Doc and Edgeless.' },
    { title: 'Community Support.' },
    { title: 'Real-time Syncing & Collaboration for more people.' },
  ],
};

const teamBenefits: Benefits = {
  'Both in Team & Enterprise': [
    { title: 'Everything in AFFiNE Pro.', icon: <AfFiNeIcon /> },
    { title: 'Advanced Permission control, Page history and Review mode.' },
    { title: 'Pay for seats, fits all team size.' },
    { title: 'Email & Slack Support.' },
  ],
  'Enterprise only': [
    { title: 'SSO Authorization.' },
    { title: 'Solutions & Best Practices for Dedicated needs.' },
    { title: 'Embed-able & Integrations with IT support.' },
  ],
};

export function getPlanDetail() {
  return new Map<SubscriptionPlan, FixedPrice | DynamicPrice>([
    [
      SubscriptionPlan.Free,
      {
        type: 'fixed',
        plan: SubscriptionPlan.Free,
        price: '0',
        yearlyPrice: '0',
        name: 'FOSS + Basic',
        description: 'Open-Source under MIT license.',
        titleRenderer: () => 'Free forever',
        benefits: freeBenefits,
      },
    ],
    [
      SubscriptionPlan.Pro,
      {
        type: 'fixed',
        plan: SubscriptionPlan.Pro,
        price: '1',
        yearlyPrice: '1',
        name: 'Pro',
        description: 'For family and small teams.',
        titleRenderer: (recurring, detail) => {
          const price =
            recurring === SubscriptionRecurring.Yearly
              ? detail.yearlyPrice
              : detail.price;
          return `$${price} per month`;
        },
        benefits: proBenefits,
      },
    ],
    [
      SubscriptionPlan.Team,
      {
        type: 'dynamic',
        plan: SubscriptionPlan.Team,
        contact: true,
        name: 'Team / Enterprise',
        description: 'Best for scalable teams.',
        titleRenderer: () => 'Contact Sales',
        benefits: teamBenefits,
      },
    ],
  ]);
}

import dynamic from 'next/dynamic';
import React, { Suspense } from 'react';
import useSWR, { SWRConfig, SWRConfiguration } from 'swr';

const Lottie = dynamic(() => import('lottie-react'));

const LottiePageInner: React.FC = () => {
  const { data: walk } = useSWR('walk', {
    fallbackData: null,
  });
  return walk ? (
    <Lottie animationData={walk} loop={true} autoplay={true} />
  ) : null;
};

const lottieConfig: SWRConfiguration = {
  suspense: true,
  fetcher: path => {
    if (path === 'walk') {
      return import('../../static/walk.json');
    }
  },
};

export default function LottiePage() {
  return (
    <SWRConfig value={lottieConfig}>
      <Suspense fallback="loading">
        <LottiePageInner />
      </Suspense>
    </SWRConfig>
  );
}

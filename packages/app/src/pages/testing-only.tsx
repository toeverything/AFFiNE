import { useEffect } from 'react';
import { getDataCenter } from '@affine/datacenter';
/**
 * testing only when development
 */

const Page = () => {
  useEffect(() => {
    getDataCenter().then(dc => {
      // @ts-expect-error global variable
      window.dc = dc;
    });
  }, []);

  return <div>Testing only</div>;
};

export default Page;

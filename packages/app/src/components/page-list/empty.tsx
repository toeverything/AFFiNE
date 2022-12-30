import React from 'react';
import { Empty } from '@/ui/empty';
export const PageListEmpty = () => {
  return (
    <div style={{ textAlign: 'center' }}>
      <Empty
        width={800}
        height={300}
        sx={{ marginTop: '100px', marginBottom: '30px' }}
      />
      <p>Tips: Click Add to Favourites/Trash and the page will appear here.</p>
      <p>(Designer is grappling with designing)</p>
    </div>
  );
};

export default PageListEmpty;

'use server';

import { lazy } from 'react';

import { saveFile } from '../../server-fns.js';

const SaveToLocal = lazy(() =>
  import('./save-to-local.js').then(({ SaveToLocal }) => ({
    default: SaveToLocal,
  }))
);

export const Sidebar = () => {
  return (
    <div
      className="h-screen text-black overflow-y-auto"
      style={{
        backgroundColor: '#f9f7f7',
      }}
    >
      <a href="/">
        <div className="flex items-center justify-center h-16 font-bold">
          AFFiNE
        </div>
      </a>
      {import.meta.env.MODE === 'development' && (
        <SaveToLocal saveFile={saveFile} />
      )}
    </div>
  );
};

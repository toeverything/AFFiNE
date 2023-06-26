'use server';

import { saveFile } from '../../server-fns.js';
import { SaveToLocal } from './save-to-local.js';

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

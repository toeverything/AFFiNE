import { Suspense } from 'react';

const DailyNotePageInner = () => {
  return (
    <div>
      <button>Save</button>
    </div>
  );
};

const DailyNotePage = () => {
  return (
    <Suspense>
      <DailyNotePageInner />
    </Suspense>
  );
};

export default DailyNotePage;

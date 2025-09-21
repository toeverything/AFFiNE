import { SafeArea, Skeleton } from '@affine/component';

import { WorkspaceSelector } from '../workspace-selector';

const SectionTitleFallback = () => {
  return (
    <div style={{ padding: '0 16px' }}>
      <Skeleton
        animation="wave"
        style={{ height: 16, borderRadius: 4, width: 93 }}
      />
    </div>
  );
};
const sectionRows = [127, 238, 191, 102];

const Section = () => {
  return (
    <div style={{ marginBottom: 32 }}>
      <SectionTitleFallback />
      <div
        style={{
          padding: '0 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          marginTop: 24,
        }}
      >
        {sectionRows.map((width, i) => {
          return (
            <div
              style={{ display: 'flex', gap: 16, alignItems: 'center' }}
              key={i}
            >
              <Skeleton
                animation="wave"
                style={{ width: 23, height: 23, borderRadius: 4 }}
              />
              <Skeleton
                animation="wave"
                style={{ width, height: 16, borderRadius: 4 }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const AppFallback = () => {
  return (
    <SafeArea top bottom style={{ height: '100dvh', overflow: 'hidden' }}>
      {/* notification and setting */}
      <div
        style={{
          padding: 10,
          paddingTop: 0,
          display: 'flex',
          justifyContent: 'end',
          gap: 10,
        }}
      >
        <Skeleton
          animation="wave"
          style={{ width: 28, height: 28, borderRadius: 4 }}
        />
        <Skeleton
          animation="wave"
          style={{ width: 28, height: 28, borderRadius: 4 }}
        />
      </div>
      {/* workspace card */}
      <div style={{ padding: '4px 16px' }}>
        <WorkspaceSelector />
      </div>
      {/* search */}
      <div style={{ padding: '10px 16px 15px' }}>
        <Skeleton animation="wave" style={{ height: 44, borderRadius: 10 }} />
      </div>
      {/* recent */}
      <SectionTitleFallback />
      <div style={{ padding: '16px 16px 32px 16px', display: 'flex', gap: 10 }}>
        {[1, 2, 3].map(i => (
          <Skeleton
            key={i}
            animation="wave"
            style={{ width: 172, height: 210, borderRadius: 12 }}
          />
        ))}
      </div>
      <Section />
      <Section />
    </SafeArea>
  );
};

import { Button, SafeArea, Skeleton } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { cssVarV2 } from '@toeverything/theme/v2';

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

export const AppFallback = ({ onRetry }: { onRetry?: () => void }) => {
  const t = useI18n();

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
        <Skeleton
          animation="wave"
          style={{ width: 220, height: 40, borderRadius: 8 }}
        />
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
      {onRetry ? (
        <div
          role="alert"
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 24,
            background: cssVarV2('layer/background/mobile/primary'),
          }}
        >
          <div style={{ maxWidth: 320, textAlign: 'center' }}>
            {t['error.INTERNAL_SERVER_ERROR']()}
          </div>
          <Button
            variant="primary"
            style={{ minWidth: 104, height: 44 }}
            onClick={onRetry}
          >
            {t['Retry']()}
          </Button>
        </div>
      ) : null}
    </SafeArea>
  );
};

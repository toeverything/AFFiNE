import { Toaster } from 'sonner';

export function MobileNotificationCenter() {
  return (
    <Toaster
      visibleToasts={1}
      position="top-center"
      style={{
        width: '100%',
        top: 'calc(env(safe-area-inset-top) + 16px)',
        pointerEvents: 'auto',
      }}
    />
  );
}

import { style } from '@vanilla-extract/css';
export const editor = style({
  flex: 1,
  selectors: {
    '&.full-screen': {
      width: '100%',
      minWidth: 0,
      vars: {
        '--affine-editor-width': '100%',
        '--affine-editor-side-padding': '72px',
      },
    },
  },
  '@media': {
    'screen and (max-width: 800px)': {
      selectors: {
        '&.is-public': {
          vars: {
            '--affine-editor-width': '100%',
            '--affine-editor-side-padding': '24px',
          },
        },
      },
    },
  },
});

// 加上你專屬的 3D 玻璃擬真日記本樣式
export const glassJournalWrapper = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '80vh',
  padding: '40px 20px',
  // 👇 實現投影片第 10 頁的 Glassmorphism 擬真效果
  background: 'rgba(255, 255, 255, 0.1)', 
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderRadius: '16px',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.15)',
});

export const journalPageSheet = style({
  background: '#ffffff',
  padding: '32px',
  color: '#1a1a1a',
  // 👇 做出書本內頁翻動時，靠近書背那一側的淡淡物理陰影（左頁右側陰影、右頁左側陰影）
  boxShadow: 'inset 4px 0 10px rgba(0, 0, 0, 0.05), 0 4px 12px rgba(0, 0, 0, 0.05)',
  borderRadius: '4px',
});


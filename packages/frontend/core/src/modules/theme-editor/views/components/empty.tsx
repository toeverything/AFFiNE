import { Empty } from '@affine/component';

export const ThemeEmpty = () => {
  return (
    <div
      style={{ width: 0, flex: 1, display: 'flex', justifyContent: 'center' }}
    >
      <Empty description="Select a variable to edit" />
    </div>
  );
};

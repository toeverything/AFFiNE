import { IconPicker } from './icon-picker';

export default {
  title: 'UI/IconPicker',
  component: IconPicker,
};

export const Default = () => {
  return (
    <>
      <div>Selected: // TODO</div>
      <IconPicker
        style={{
          border: '1px solid rgba(100, 100, 100, 0.2)',
          borderRadius: 8,
        }}
      />
    </>
  );
};

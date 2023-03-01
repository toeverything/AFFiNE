# Affine Official Workspace Component

This component need specific configuration to work properly.

## Configuration

### SWR

Each component use SWR to fetch data from the API. You need to provide a configuration to SWR to make it work.

```tsx
const Wrapper = () => {
  return (
    <AffineSWRConfigProvider>
      <Component />
    </AffineSWRConfigProvider>
  );
};
```

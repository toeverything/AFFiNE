import { DEFAULT_CONNECTOR_CORNER_RADIUS } from '@blocksuite/affine-model';
import { describe, expect, it } from 'vitest';

import { ConnectorSchema } from '../../utils/zod-schema.js';

describe('ConnectorSchema', () => {
  it('defaults cornerRadius to DEFAULT_CONNECTOR_CORNER_RADIUS', () => {
    const parsed = ConnectorSchema.parse(undefined);
    expect(parsed.cornerRadius).toBe(DEFAULT_CONNECTOR_CORNER_RADIUS);
  });

  it('requires cornerRadius when parsing a partial object directly', () => {
    const { cornerRadius: _cornerRadius, ...withoutCornerRadius } =
      ConnectorSchema.parse(undefined);
    expect(() =>
      ConnectorSchema.removeDefault().parse(withoutCornerRadius)
    ).toThrow();
  });
});

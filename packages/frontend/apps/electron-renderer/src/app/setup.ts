import '@affine/core/bootstrap/electron';
import '@affine/component/theme';
import './global.css';

import { apis } from '@affine/electron-api';
import { bindNativeDBApis } from '@affine/nbstore/sqlite';
import { bindNativeDBV1Apis } from '@affine/nbstore/sqlite/v1';

// oxlint-disable-next-line no-non-null-assertion
bindNativeDBApis(apis!.nbstore);
// oxlint-disable-next-line no-non-null-assertion
bindNativeDBV1Apis(apis!.db);

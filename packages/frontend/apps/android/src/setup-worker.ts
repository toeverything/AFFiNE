import '@affine/core/bootstrap/browser';

import { installCleartextGuard } from '@affine/core/utils/local-network/cleartext-guard';

installCleartextGuard(globalThis);

import { Injectable } from '@nestjs/common';

import { PermissionService } from '../workspaces/permission';
import { FeatureService } from './configure';

@Injectable()
export class FeatureManagementService {
  constructor(
    private readonly feature: FeatureService,
    private readonly permissions: PermissionService
  ) {}
}

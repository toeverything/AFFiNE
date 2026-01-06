import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { BaseModel } from './base';
import {
  type FeatureConfig,
  FeatureConfigs,
  type FeatureName,
  FeaturesShapes,
  FeatureType,
} from './common';

@Injectable()
export class FeatureModel extends BaseModel {
  async get<T extends FeatureName>(name: T) {
    const feature = await this.get_unchecked(name);

    return {
      ...feature,
      configs: this.check(name, feature.configs),
    };
  }

  /**
   * Get the latest feature from code definitions.
   *
   * @internal
   */
  async try_get_unchecked<T extends FeatureName>(name: T) {
    const config = FeatureConfigs[name];
    if (!config) {
      return null;
    }

    return {
      name,
      configs: config.configs,
      type: config.type,
    };
  }

  /**
   * Get the latest feature from code definitions.
   *
   * @throws {Error} If the feature is not found in code.
   * @internal
   */
  async get_unchecked<T extends FeatureName>(name: T) {
    const feature = await this.try_get_unchecked(name);

    if (!feature) {
      throw new Error(`Feature ${name} not found`);
    }

    return feature;
  }

  check<T extends FeatureName>(name: T, config: any) {
    const shape = this.getConfigShape(name);
    const parseResult = shape.safeParse(config);

    if (!parseResult.success) {
      throw new Error(`Invalid feature config for ${name}`, {
        cause: parseResult.error,
      });
    }

    return parseResult.data as FeatureConfig<T>;
  }

  getConfigShape(name: FeatureName): z.ZodObject<any> {
    return FeaturesShapes[name] ?? z.object({});
  }

  getFeatureType(name: FeatureName): FeatureType {
    return FeatureConfigs[name].type;
  }
}

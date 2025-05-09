/* eslint-disable */
import '../src/prelude';
import '../src/app.module';

import fs from 'node:fs';
import { ProjectRoot } from '@affine-tools/utils/path';
import { Package } from '@affine-tools/utils/workspace';
import {
  getDescriptors as getAllDescriptors,
  ConfigDescriptor,
} from '../src/base/config/register';

const IGNORED_MODULES = new Set(['db', 'redis', 'graphql']);

function getDescriptors() {
  return getAllDescriptors().filter(
    ({ module }) => !IGNORED_MODULES.has(module)
  );
}

interface PropertySchema {
  description: string;
  type?: 'array' | 'boolean' | 'integer' | 'number' | 'object' | 'string';
  default?: any;
}

function convertDescriptorToSchemaProperty(descriptor: ConfigDescriptor<any>) {
  const property: PropertySchema = {
    ...descriptor.schema,
    description:
      descriptor.schema.description +
      `\n@default ${JSON.stringify(descriptor.default)}` +
      (descriptor.env ? `\n@environment \`${descriptor.env[0]}\`` : '') +
      (descriptor.link ? `\n@link ${descriptor.link}` : ''),
    default: descriptor.default,
  };

  return property;
}

function generateJsonSchema(outputPath: string) {
  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'AFFiNE Application Configuration',
    type: 'object',
    properties: {},
  };

  getDescriptors().forEach(({ module, descriptors }) => {
    schema.properties[module] = {
      type: 'object',
      description: `Configuration for ${module} module`,
      properties: {},
    };

    descriptors.forEach(({ key, descriptor }) => {
      schema.properties[module].properties[key] =
        convertDescriptorToSchemaProperty(descriptor);
    });
  });

  fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));

  console.log(`Config schema generated at: ${outputPath}`);
}

function generateAdminConfigJson(outputPath: string) {
  const config = {};
  getDescriptors().forEach(({ module, descriptors }) => {
    const modulizedConfig = {};
    config[module] = modulizedConfig;
    descriptors.forEach(({ key, descriptor }) => {
      let type: string;
      switch (descriptor.schema?.type) {
        case 'number':
          type = 'Number';
          break;
        case 'boolean':
          type = 'Boolean';
          break;
        case 'array':
          type = 'Array';
          break;
        case 'object':
          type = 'Object';
          break;
        default:
          type = 'String';
      }

      modulizedConfig[key] = {
        type,
        desc: descriptor.desc,
        link: descriptor.link,
        env: descriptor.env?.[0],
      };
    });
  });
  fs.writeFileSync(outputPath, JSON.stringify(config, null, 2));
}

function main() {
  generateJsonSchema(
    ProjectRoot.join('.docker', 'selfhost', 'schema.json').toString()
  );
  generateAdminConfigJson(
    new Package('@affine/admin').join('src/config.json').toString()
  );
}

main();

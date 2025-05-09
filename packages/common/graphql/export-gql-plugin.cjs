const fs = require('node:fs');
const path = require('node:path');

const { Kind, print, visit, TypeInfo, visitWithTypeInfo } = require('graphql');
const { upperFirst, lowerFirst } = require('lodash');

/**
 * return exported name used in runtime.
 *
 * @param {import('graphql').ExecutableDefinitionNode} def
 * @returns {string}
 */
function getExportedName(def) {
  const name = lowerFirst(def.name?.value);
  const suffix =
    def.kind === Kind.OPERATION_DEFINITION
      ? upperFirst(def.operation)
      : 'Fragment';
  return name.endsWith(suffix) ? name : name + suffix;
}

/**
 * Check if a field is deprecated in the schema
 *
 * @param {import('graphql').GraphQLSchema} schema
 * @param {string} typeName
 * @param {string} fieldName
 * @returns {boolean}
 */
function fieldDeprecation(schema, typeName, fieldName) {
  const type = schema.getType(typeName);
  if (!type || !type.getFields) {
    return false;
  }

  const fields = type.getFields();
  const field = fields[fieldName];

  return field?.deprecationReason
    ? {
        name: fieldName,
        reason: field.deprecationReason,
      }
    : null;
}

/**
 * Check if a query uses deprecated fields
 *
 * @param {import('graphql').GraphQLSchema} schema
 * @param {import('graphql').DocumentNode} document
 * @returns {boolean}
 */
function parseDeprecations(schema, document) {
  const deprecations = [];

  const typeInfo = new TypeInfo(schema);

  visit(
    document,
    visitWithTypeInfo(typeInfo, {
      Field: {
        enter(node) {
          const parentType = typeInfo.getParentType();
          if (parentType && node.name) {
            const fieldName = node.name.value;
            let deprecation;
            if (
              parentType.name &&
              (deprecation = fieldDeprecation(
                schema,
                parentType.name,
                fieldName
              ))
            ) {
              deprecations.push(deprecation);
            }
          }
        },
      },
    })
  );

  return deprecations.map(
    ({ name, reason }) => `'${name}' is deprecated: ${reason}`
  );
}

/**
 * @type {import('@graphql-codegen/plugin-helpers').CodegenPlugin}
 */
module.exports = {
  plugin: (schema, documents, { output }) => {
    const defs = new Map();
    const queries = [];
    const mutations = [];

    const nameLocationMap = new Map();
    const locationSourceMap = new Map(
      documents
        .filter(source => !!source.location)
        .map(source => [source.location, source])
    );

    function addDef(exportedName, location) {
      if (nameLocationMap.has(exportedName)) {
        throw new Error(
          `name ${exportedName} export from ${location} are duplicated.`
        );
      }

      nameLocationMap.set(exportedName, location);
    }

    function parseImports(location) {
      if (!location) {
        return '';
      }

      // parse '#import' lines
      const importedDefinitions = [];
      fs.readFileSync(location, 'utf-8')
        .split(/\r\n|\r|\n/)
        .forEach(line => {
          if (line[0] === '#') {
            const [importKeyword, importPath] = line.split(' ').filter(Boolean);
            if (importKeyword === '#import') {
              const realImportPath = path.posix.join(
                location,
                '..',
                importPath.replace(/["']/g, '')
              );
              const imports =
                locationSourceMap.get(realImportPath)?.document.definitions;
              if (imports) {
                importedDefinitions.push(...imports);
              }
            }
          }
        });

      return importedDefinitions
        .map(def => `\${${getExportedName(def)}}`)
        .join('\n');
    }

    for (const [location, source] of locationSourceMap) {
      if (!source || !source.document || !source.rawSDL) {
        return;
      }

      visit(source.document, {
        [Kind.OPERATION_DEFINITION]: {
          enter: node => {
            if (!node.name) {
              throw new Error(
                `Anonymous operation definition found in ${location}.`
              );
            }

            const exportedName = getExportedName(node);
            addDef(exportedName, location);

            // parse 'file' fields
            const containsFile = node.variableDefinitions.some(def => {
              const varType =
                def.type.kind === 'NamedType'
                  ? def.type.name.value
                  : def?.type?.type?.name?.value;
              const checkContainFile = type => {
                if (schema.getType(type)?.name === 'Upload') return true;
                const typeDef = schema.getType(type);
                const fields = typeDef.getFields?.();
                if (!fields || typeof fields !== 'object') return false;
                for (let field of Object.values(fields)) {
                  let type = field.type;
                  while (type.ofType) {
                    type = type.ofType;
                  }
                  if (type.name === 'Upload') {
                    return true;
                  }
                }
                return false;
              };
              return varType ? checkContainFile(varType) : false;
            });

            // Check if the query uses deprecated fields
            const deprecations = parseDeprecations(schema, source.document);

            const imports = parseImports(location);

            defs.set(exportedName, {
              type: node.operation,
              name: exportedName,
              operationName: node.name.value,
              containsFile,
              deprecations,
              query: `${print(node)}${imports ? `\n${imports}` : ''}`,
            });

            if (node.operation === 'query') {
              queries.push(exportedName);
            } else if (node.operation === 'mutation') {
              mutations.push(exportedName);
            }
          },
        },
        [Kind.FRAGMENT_DEFINITION]: {
          enter: node => {
            const exportedName = getExportedName(node);
            addDef(exportedName, location);

            const imports = parseImports(location);

            defs.set(exportedName, {
              type: 'fragment',
              name: exportedName,
              content: `${print(node)}${imports || ''}`,
            });
          },
        },
      });
    }

    const preludes = [
      '/* do not manipulate this file manually. */',
      `export interface GraphQLQuery {
  id: string;
  op: string;
  query: string;
  file?: boolean;
  deprecations?: string[];
}`,
    ];

    const operations = [];

    defs.forEach(def => {
      if (def.type === 'fragment') {
        preludes.push(`export const ${def.name} = \`${def.content}\`;`);
      } else {
        let item = `export const ${def.name} = {
  id: '${def.name}' as const,
  op: '${def.operationName}',
  query: \`${def.query}\`,
`;
        if (def.containsFile) {
          item += '  file: true,\n';
        }
        if (def.deprecations.length) {
          item += `  deprecations: ${JSON.stringify(def.deprecations)},\n`;
        }
        item += '};\n';

        operations.push(item);
      }
    });

    fs.writeFileSync(
      output,
      preludes.join('\n') + '\n' + operations.join('\n')
    );

    const queriesUnion = queries
      .map(query => {
        const queryName = upperFirst(query);
        return `{
          name: '${query}',
          variables: ${queryName}Variables,
          response: ${queryName}
        }
      `;
      })
      .join('|');

    const mutationsUnion = mutations
      .map(query => {
        const queryName = upperFirst(query);
        return `{
          name: '${query}',
          variables: ${queryName}Variables,
          response: ${queryName}
        }
      `;
      })
      .join('|');
    const queryTypes = queriesUnion
      ? `export type Queries = ${queriesUnion}`
      : '';
    const mutationsTypes = mutationsUnion
      ? `export type Mutations = ${mutationsUnion}`
      : '';
    return `
${queryTypes}
${mutationsTypes}
`;
  },
  validate: (_schema, _documents, { output }) => {
    if (!output) {
      throw new Error('Export plugin must be used with a output file given');
    }
  },
};

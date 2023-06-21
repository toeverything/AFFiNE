const fs = require('fs');
const path = require('path');

const { Kind, print } = require('graphql');
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
 * @type {import('@graphql-codegen/plugin-helpers').CodegenPlugin}
 */
module.exports = {
  plugin: (_schema, documents, { output }) => {
    const nameLocationMap = new Map();
    const locationSourceMap = new Map(
      documents
        .filter(source => !!source.location)
        .map(source => [source.location, source])
    );

    /**
     * @type {string[]}
     */
    const defs = [];
    const queries = [];
    const mutations = [];

    for (const [location, source] of locationSourceMap) {
      if (
        !source ||
        !source.document ||
        !location ||
        source.document.kind !== Kind.DOCUMENT ||
        !source.document.definitions ||
        !source.document.definitions.length
      ) {
        return;
      }

      const doc = source.document;

      if (doc.definitions.length > 1) {
        throw new Error('Only support one definition per file.');
      }
      const definition = doc.definitions[0];
      if (!definition) {
        throw new Error(`Found empty file ${location}.`);
      }

      if (
        !definition.selectionSet ||
        !definition.selectionSet.selections ||
        definition.selectionSet.selections.length === 0
      ) {
        throw new Error(`Found empty fields selection in file ${location}`);
      }

      if (
        definition.kind === Kind.OPERATION_DEFINITION ||
        definition.kind === Kind.FRAGMENT_DEFINITION
      ) {
        if (!definition.name) {
          throw new Error(`Anonymous definition found in ${location}`);
        }

        const exportedName = getExportedName(definition);

        // duplication checking
        if (nameLocationMap.has(exportedName)) {
          throw new Error(
            `name ${exportedName} export from ${location} are duplicated.`
          );
        } else {
          /**
           * @type {import('graphql').DefinitionNode[]}
           */
          let importedDefinitions = [];
          if (source.location) {
            fs.readFileSync(source.location, 'utf8')
              .split(/\r\n|\r|\n/)
              .forEach(line => {
                if (line[0] === '#') {
                  const [importKeyword, importPath] = line
                    .split(' ')
                    .filter(Boolean);
                  if (importKeyword === '#import') {
                    const realImportPath = path.posix.join(
                      location,
                      '..',
                      importPath.replace(/["']/g, '')
                    );
                    const imports =
                      locationSourceMap.get(realImportPath)?.document
                        .definitions;
                    if (imports) {
                      importedDefinitions = [
                        ...importedDefinitions,
                        ...imports,
                      ];
                    }
                  }
                }
              });
          }

          const importing = importedDefinitions
            .map(def => `\${${getExportedName(def)}}`)
            .join('\n');

          // is query or mutation
          if (definition.kind === Kind.OPERATION_DEFINITION) {
            // add for runtime usage
            doc.operationName = definition.name.value;
            doc.defName = definition.selectionSet.selections
              .filter(field => field.kind === Kind.FIELD)
              .map(field => field.name.value)
              .join(',');
            nameLocationMap.set(exportedName, location);
            const containsFile = doc.definitions.some(def => {
              const { variableDefinitions } = def;
              if (variableDefinitions) {
                return variableDefinitions.some(variableDefinition => {
                  if (
                    variableDefinition?.type?.type?.name?.value === 'Upload'
                  ) {
                    return true;
                  }
                  return false;
                });
              } else {
                return false;
              }
            });
            defs.push(`export const ${exportedName} = {
  id: '${exportedName}' as const,
  operationName: '${doc.operationName}',
  definitionName: '${doc.defName}',
  containsFile: ${containsFile},
  query: \`
${print(doc)}${importing || ''}\`,
}
`);
            if (definition.operation === 'query') {
              queries.push(exportedName);
            } else if (definition.operation === 'mutation') {
              mutations.push(exportedName);
            }
          } else {
            defs.unshift(`export const ${exportedName} = \`
${print(doc)}${importing || ''}\``);
          }
        }
      }
    }

    fs.writeFileSync(
      output,
      [
        '/* do not manipulate this file manually. */',
        `export interface GraphQLQuery {
  id: string
  operationName: string
  definitionName: string
  query: string
  containsFile?: boolean
}
`,
        ...defs,
      ].join('\n')
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

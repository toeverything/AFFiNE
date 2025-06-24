import {
  MethodDeclaration,
  Node,
  Project,
  PropertyDeclaration,
} from 'ts-morph';

import { type CollectedApisMap, type ParsedDecoratorInfo } from './types';
import { determineEntry } from './utils';

export const IpcHandleDecoratorName = 'IpcHandle';

type IpcDecoratedMember = MethodDeclaration | PropertyDeclaration;

/**
 * Parses the @IpcHandle decorator and extracts relevant information
 */
function parseIpcHandleDecorator(
  memberDeclaration: IpcDecoratedMember
): ParsedDecoratorInfo {
  const ipcHandleDecorator = memberDeclaration
    .getDecorators()
    .find(d => d.getName() === IpcHandleDecoratorName);

  if (!ipcHandleDecorator) {
    return {}; // No decorator found
  }

  const decoratorArgs = ipcHandleDecorator.getArguments();
  const sourceFile = memberDeclaration.getSourceFile();
  const methodNameInCode = memberDeclaration.getName(); // For error messages and fallback

  if (decoratorArgs.length === 0) {
    return {
      error: `@${IpcHandleDecoratorName} on ${methodNameInCode} in ${sourceFile.getFilePath()} is missing arguments.`,
    };
  }

  const optionsArg = decoratorArgs[0];

  if (Node.isObjectLiteralExpression(optionsArg)) {
    const scopeProperty = optionsArg.getProperty('scope');
    let scopeValue: string | undefined;

    if (scopeProperty && Node.isPropertyAssignment(scopeProperty)) {
      const scopeInitializer = scopeProperty.getInitializer();
      if (scopeInitializer) {
        if (Node.isStringLiteral(scopeInitializer)) {
          scopeValue = scopeInitializer.getLiteralValue();
        } else if (Node.isPropertyAccessExpression(scopeInitializer)) {
          const checker = scopeInitializer.getProject().getTypeChecker();
          const propertyAccessType = scopeInitializer.getType(); // Type of the e.g. IpcScope.MAIN expression

          if (propertyAccessType.isStringLiteral()) {
            const literalValue = propertyAccessType.getLiteralValue();
            if (typeof literalValue === 'string') {
              scopeValue = literalValue;
            } else {
              // This case should be rare if isStringLiteral() is true
              return {
                error: `Scope for ${methodNameInCode} in ${sourceFile.getFilePath()} resolved to a string literal type, but its value is not a string: ${literalValue}. Please use a string enum or string literal for scope.`,
              };
            }
          } else {
            // The type of the expression (e.g., IpcScope.MAIN) is not itself a string literal type.
            // This might happen if IpcScope is a numeric enum, or a more complex type.
            // Attempt to get the constant value of the expression.
            const constant = checker.compilerObject.getConstantValue(
              scopeInitializer.compilerNode
            );
            if (typeof constant === 'string') {
              scopeValue = constant;
            } else {
              let errorMessage = `Unable to resolve 'scope' for ${methodNameInCode} in ${sourceFile.getFilePath()} to a string constant. `;
              if (typeof constant === 'number') {
                errorMessage += `Resolved to a number (${constant}). Please use a string enum or string literal.`;
              } else if (constant === undefined) {
                errorMessage += `The expression does not resolve to a compile-time constant string. Ensure it's a direct string enum member (e.g., MyEnum.Value) or a string literal.`;
              } else {
                errorMessage += `Resolved to an unexpected type '${typeof constant}' with value '${constant}'. Please use a string enum or string literal.`;
              }
              return { error: errorMessage };
            }
          }
        }
      }
    }

    if (!scopeValue) {
      return {
        error: `@${IpcHandleDecoratorName} in ${methodNameInCode} in ${sourceFile.getFilePath()} is missing a valid 'scope'.`,
      };
    }

    let nameValue: string | undefined;
    const nameProperty = optionsArg.getProperty('name');
    if (nameProperty && Node.isPropertyAssignment(nameProperty)) {
      const nameInitializer = nameProperty.getInitializer();
      if (nameInitializer && Node.isStringLiteral(nameInitializer)) {
        nameValue = nameInitializer.getLiteralValue();
      } else if (nameInitializer) {
        return {
          error: `@${IpcHandleDecoratorName} in ${methodNameInCode} in ${sourceFile.getFilePath()} has an invalid 'name' property. It must be a string literal.`,
        };
      }
    }
    return {
      scope: scopeValue,
      apiMethodName: nameValue ?? methodNameInCode,
      entry: determineEntry(sourceFile.getFilePath()),
      filePath: sourceFile.getFilePath() as string,
    };
  } else if (Node.isStringLiteral(optionsArg)) {
    return {
      error: `@${IpcHandleDecoratorName} on ${methodNameInCode} in ${sourceFile.getFilePath()} uses legacy string literal. Please update to object format { scope: string, name?: string }.`,
    };
  } else {
    return {
      error: `@${IpcHandleDecoratorName} on ${methodNameInCode} in ${sourceFile.getFilePath()} has invalid arguments.`,
    };
  }
}

/**
 * Parses all IPC handlers in the project and collects their information
 */
export function parseIpcHandlers(project: Project): {
  apis: CollectedApisMap;
} {
  const collectedApiHandlers: CollectedApisMap = new Map();

  project.getSourceFiles().forEach(sourceFile => {
    sourceFile.getClasses().forEach(classDeclaration => {
      // Iterate over both traditional methods and property declarations (which can
      // hold arrow-function handlers) so that handlers like
      // `handleWebContentsResize = () => {}` are also detected.
      const members: IpcDecoratedMember[] = [
        ...classDeclaration.getMethods(),
        ...classDeclaration.getProperties(),
      ];

      members.forEach(memberDeclaration => {
        const parsedHandlerInfo = parseIpcHandleDecorator(memberDeclaration);
        if (parsedHandlerInfo.error) {
          console.error(`[API Handler ERR] ${parsedHandlerInfo.error}`);
          return;
        }
        if (
          !parsedHandlerInfo.scope ||
          !parsedHandlerInfo.apiMethodName ||
          !parsedHandlerInfo.entry ||
          !parsedHandlerInfo.filePath
        )
          return;

        const { scope, apiMethodName, entry, filePath } = parsedHandlerInfo;
        const classDecl = memberDeclaration.getParent();
        const className = (classDecl as any)?.getName?.() || 'UnknownClass';

        // Build module path for import specifier (strip up to /src/ and .ts extension)
        const absPath = sourceFile.getFilePath() as unknown as string;
        const srcIdx = absPath.lastIndexOf('/src/');
        let modulePath = absPath;
        if (srcIdx !== -1) {
          modulePath =
            '@affine/electron/' + absPath.substring(srcIdx + '/src/'.length);
        }
        modulePath = modulePath.replace(/\.[tj]sx?$/, '');

        const description = memberDeclaration
          .getJsDocs()
          .map(doc => doc.getDescription().trim())
          .filter(Boolean)
          .join('\n');

        if (!collectedApiHandlers.has(scope))
          collectedApiHandlers.set(scope, []);
        const handlerScopeMethods = collectedApiHandlers.get(scope);
        if (handlerScopeMethods) {
          handlerScopeMethods.push({
            apiMethodName,
            modulePath,
            className,
            methodName: memberDeclaration.getName(),
            description,
            entry,
            filePath: filePath as string,
          });
        } else {
          console.error(
            `[CRITICAL] Failed to retrieve handler methods array for scope: ${scope}`
          );
        }
      });
    });
  });

  return {
    apis: collectedApiHandlers,
  };
}

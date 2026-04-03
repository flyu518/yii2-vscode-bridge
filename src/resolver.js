'use strict';

const { getObjectAccessContext, getParamsAccessContext, getCompletedObjectAccessContext, getCompletedParamsAccessContext } = require('./context');
const { parsePhpClass } = require('./parsers/phpClassParser');

function resolveCompletionContext(document, position, index) {
  const paramsAccess = getParamsAccessContext(document, position);
  if (paramsAccess) {
    return {
      kind: 'params-key',
      prefix: paramsAccess.prefix,
      receiverType: 'array',
      items: index.paramValues().map((entry) => ({
        ...entry,
        type: 'mixed',
        memberKind: 'array-key'
      }))
    };
  }

  const access = getObjectAccessContext(document, position);
  if (!access) {
    return null;
  }

  const receiverType = resolveReceiverType(document, position, access.receiver, index);
  if (!receiverType) {
    return null;
  }

  if (access.receiver.replace(/^\\/, '') === 'Yii::$app') {
    const componentItems = index.componentValues().map((component) => ({
      name: component.name,
      type: component.type,
      sourceKind: component.sourceKind,
      sourceUri: component.sourceUri,
      line: component.line,
      detail: component.detail,
      memberKind: 'property'
    }));
    const methodItems = index.getMethodsForType(receiverType).map((method) => ({
      ...method,
      memberKind: 'method'
    }));

    return {
      kind: 'app-member',
      prefix: access.prefix,
      receiverType,
      items: [...componentItems, ...methodItems]
    };
  }

  return {
    kind: 'member',
    prefix: access.prefix,
    receiverType,
    items: index.getMembersForType(receiverType)
  };
}

function resolveMemberContext(document, position, index) {
  const paramsAccess = getCompletedParamsAccessContext(document, position);
  if (paramsAccess) {
    if (paramsAccess.keyKind === 'literal') {
      const entry = index.getParam(paramsAccess.keyName);
      if (entry) {
        return {
          kind: 'params-key',
          receiverType: 'array',
          member: {
            ...entry,
            type: 'mixed',
            memberKind: 'array-key'
          },
          range: paramsAccess.range
        };
      }
    }

    if (paramsAccess.keyKind === 'variable') {
      const options = resolveVariableLiteralOptions(document, position.line, paramsAccess.keyName);
      const matches = options.map((option) => index.getParam(option)).filter(Boolean);
      if (matches.length > 0) {
        return {
          kind: 'params-key',
          receiverType: 'array',
          member: {
            ...matches[0],
            type: matches.length === 1 ? 'mixed' : `mixed (${matches.map((item) => item.name).join(' | ')})`,
            memberKind: 'array-key',
            detail: matches.map((item) => item.name).join(' | ')
          },
          extraTargets: matches,
          range: paramsAccess.range
        };
      }
    }
  }

  const access = getCompletedObjectAccessContext(document, position);
  if (!access) {
    return null;
  }

  const receiverType = resolveReceiverType(document, position, access.receiver, index);
  if (!receiverType) {
    return null;
  }

  if (access.receiver.replace(/^\\/, '') === 'Yii::$app') {
    if (access.isMethodCall) {
      const method = index.findMethod(receiverType, access.member);
      if (!method) {
        return null;
      }

      return {
        kind: 'method',
        receiverType,
        member: method,
        range: access.range
      };
    }

    const component = index.getComponent(access.member);
    if (component) {
      return {
        kind: 'component',
        receiverType,
        member: {
          ...component,
          owner: receiverType,
          memberKind: 'property'
        },
        range: access.range
      };
    }
  }

  const member = access.isMethodCall ? index.findMethod(receiverType, access.member) : index.findMember(receiverType, access.member);
  if (!member) {
    return null;
  }

  return {
    kind: access.isMethodCall ? 'method' : 'member',
    receiverType,
    member,
    range: access.range
  };
}

function resolveReceiverType(document, position, receiver, index) {
  if (!receiver) {
    return undefined;
  }

  const normalized = receiver.replace(/^\\/, '');
  if (normalized === 'Yii::$app') {
    return 'yii\\base\\Application';
  }

  if (normalized.startsWith('Yii::createObject(')) {
    return resolveCreateObjectType(normalized, document, position, index);
  }

  if (receiver === '$this') {
    return resolveCurrentClassType(document, index);
  }

  if (/^\$[A-Za-z_]\w*$/.test(receiver)) {
    return resolveVariableType(document, position.line, receiver, index);
  }

  return undefined;
}

function resolveCreateObjectType(expression, document, position, index) {
  const directClassMatch = expression.match(/Yii::createObject\(\s*([\\A-Za-z_][\\A-Za-z0-9_]*)::class(?:Name\(\))?/);
  if (directClassMatch) {
    return normalizeTypeCandidate(directClassMatch[1], document, index);
  }

  const stringClassMatch = expression.match(/Yii::createObject\(\s*['"]([^'"]+)['"]/);
  if (stringClassMatch) {
    return normalizeTypeCandidate(stringClassMatch[1], document, index);
  }

  return undefined;
}

function resolveVariableType(document, lineNumber, variableName, index) {
  const maxLookback = Math.max(0, lineNumber - 200);
  for (let line = lineNumber; line >= maxLookback; line -= 1) {
    const text = document.lineAt(line).text;

    const docblockMatch = text.match(new RegExp(`@var\\s+([^\\s]+)\\s+\\${escapeRegExp(variableName)}`));
    if (docblockMatch) {
      return normalizeTypeCandidate(docblockMatch[1], document, index);
    }

    const newMatch = text.match(new RegExp(`\\${escapeRegExp(variableName)}\\s*=\\s*new\\s+([\\\\A-Za-z_][\\\\A-Za-z0-9_]*)`));
    if (newMatch) {
      return normalizeTypeCandidate(newMatch[1], document, index);
    }

    const findOneMatch = text.match(new RegExp(`\\${escapeRegExp(variableName)}\\s*=\\s*([\\\\A-Za-z_][\\\\A-Za-z0-9_]*)::find(?:One|All)?\\(`));
    if (findOneMatch) {
      return normalizeTypeCandidate(findOneMatch[1], document, index);
    }

    const findChainMatch = text.match(new RegExp(`\\${escapeRegExp(variableName)}\\s*=\\s*([\\\\A-Za-z_][\\\\A-Za-z0-9_]*)::find\\(\\)->(?:one|all|limit|where|select)`));
    if (findChainMatch) {
      return normalizeTypeCandidate(findChainMatch[1], document, index);
    }

    const appComponentMatch = text.match(new RegExp(`\\${escapeRegExp(variableName)}\\s*=\\s*\\\\?Yii::\\$app->([A-Za-z_]\\w*)`));
    if (appComponentMatch) {
      const component = index.getComponent(appComponentMatch[1]);
      if (component && component.type) {
        return component.type;
      }
    }

    const createObjectMatch = text.match(new RegExp(`\\${escapeRegExp(variableName)}\\s*=\\s*\\\\?Yii::createObject\\((.+)`));
    if (createObjectMatch) {
      const directType = resolveCreateObjectType(`Yii::createObject(${createObjectMatch[1]}`, document, { line }, index);
      if (directType) {
        return directType;
      }
    }
  }

  return undefined;
}

function resolveVariableLiteralOptions(document, lineNumber, variableName) {
  const maxLookback = Math.max(0, lineNumber - 40);
  const values = new Set();
  for (let line = lineNumber; line >= maxLookback; line -= 1) {
    const text = document.lineAt(line).text;
    const assignMatch = text.match(new RegExp(`\\${escapeRegExp(variableName)}\\s*=\\s*(.+);?`));
    if (!assignMatch) {
      continue;
    }

    const expression = assignMatch[1];
    for (const match of expression.matchAll(/'([^']+)'|"([^"]+)"/g)) {
      values.add(match[1] || match[2]);
    }

    if (values.size > 0) {
      return Array.from(values);
    }
  }

  return [];
}

function resolveCurrentClassType(document, index) {
  const parsed = parsePhpClass(document.getText(), document.uri);
  if (parsed) {
    return parsed.fqcn;
  }

  const workspaceClass = Array.from(index.classes.values()).find((item) => item.sourceUri && item.sourceUri.fsPath === document.uri.fsPath);
  return workspaceClass ? workspaceClass.fqcn : undefined;
}

function normalizeTypeCandidate(typeName, document, index) {
  if (!typeName) {
    return undefined;
  }

  const clean = typeName.replace(/^\\/, '').replace(/\[\]$/, '');
  if (index.getClass(clean)) {
    return clean;
  }

  const current = parsePhpClass(document.getText(), document.uri);
  if (current) {
    if (typeName === 'self' || typeName === 'static') {
      return current.fqcn;
    }

    if (!typeName.includes('\\')) {
      const sameNamespace = current.namespace ? `${current.namespace}\\${clean}` : clean;
      if (index.getClass(sameNamespace)) {
        return sameNamespace;
      }
    }
  }

  return clean;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  resolveCompletionContext,
  resolveMemberContext,
  resolveReceiverType,
  resolveVariableType,
  resolveVariableLiteralOptions
};

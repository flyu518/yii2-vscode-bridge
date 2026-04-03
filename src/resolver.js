'use strict';

const {
  getObjectAccessContext,
  getParamsAccessContext,
  getArrayAccessContext,
  getCompletedObjectAccessContext,
  getCompletedParamsAccessContext,
  getCompletedArrayAccessContext
} = require('./context');
const { parsePhpClass } = require('./parsers/phpClassParser');

function resolveCompletionContext(document, position, index) {
  const arrayAccess = getArrayAccessContext(document, position);
  if (arrayAccess) {
    const shapeMembers = resolveArrayShapeMembers(document, position.line, arrayAccess.receiver, arrayAccess.path, index);
    if (shapeMembers.length > 0) {
      return {
        kind: 'array-key',
        prefix: arrayAccess.prefix,
        receiverType: 'array',
        items: shapeMembers.map((entry) => ({
          ...entry,
          memberKind: 'array-key'
        }))
      };
    }
  }

  const paramsAccess = getParamsAccessContext(document, position);
  if (paramsAccess) {
    return {
      kind: 'params-key',
      prefix: paramsAccess.prefix,
      receiverType: 'array',
      items: index.paramValues().map((entry) => ({
        ...entry,
        type: entry.type || 'mixed',
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
  const completedArrayAccess = getCompletedArrayAccessContext(document, position);
  if (completedArrayAccess) {
    const shapeMembers = resolveArrayShapeMembers(document, position.line, completedArrayAccess.receiver, completedArrayAccess.path, index);
    const entry = shapeMembers.find((item) => item.name === completedArrayAccess.keyName);
    if (entry) {
      return {
        kind: 'array-key',
        receiverType: 'array',
        member: {
          ...entry,
          memberKind: 'array-key'
        },
        range: completedArrayAccess.range
      };
    }
  }

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
            type: entry.type || 'mixed',
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
            type: matches.length === 1 ? (matches[0].type || 'mixed') : `mixed (${matches.map((item) => item.name).join(' | ')})`,
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

function resolveVariableArrayShape(document, lineNumber, variableName, index) {
  const maxLookback = Math.max(0, lineNumber - 80);
  for (let line = lineNumber; line >= maxLookback; line -= 1) {
    const text = document.lineAt(line).text;

    const paramsLiteralMatch = text.match(new RegExp(`\\${escapeRegExp(variableName)}\\s*=\\s*\\\\?Yii::\\$app->params\\[\\s*['"]([^'"]+)['"]\\s*\\]`));
    if (paramsLiteralMatch) {
      return getShapeMembersForParamEntry(index.getParam(paramsLiteralMatch[1]), []);
    }

    const paramsVariableMatch = text.match(new RegExp(`\\${escapeRegExp(variableName)}\\s*=\\s*\\\\?Yii::\\$app->params\\[\\s*(\\$[A-Za-z_]\\w*)\\s*\\]`));
    if (paramsVariableMatch) {
      const options = resolveVariableLiteralOptions(document, line, paramsVariableMatch[1]);
      const merged = mergeShapeMembers(options.map((name) => getShapeMembersForParamEntry(index.getParam(name), [])));
      if (merged.length > 0) {
        return merged;
      }
    }

    const variableArrayLiteralMatch = text.match(new RegExp(`\\${escapeRegExp(variableName)}\\s*=\\s*(\\$[A-Za-z_]\\w*)((?:\\s*\\[\\s*['"][^'"]+['"]\\s*\\])+);?`));
    if (variableArrayLiteralMatch) {
      const parentMembers = resolveArrayShapeMembers(document, line, variableArrayLiteralMatch[1], parseLiteralChain(variableArrayLiteralMatch[2]), index);
      if (parentMembers.length > 0) {
        return parentMembers;
      }
    }
  }

  return [];
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

function resolveArrayShapeMembers(document, lineNumber, receiver, path, index) {
  const normalized = String(receiver).trim();
  const keyPath = Array.isArray(path) ? path : [];

  if (normalized.match(/^\\?Yii::\$app->params$/)) {
    if (keyPath.length === 0) {
      return index.paramValues();
    }

    return getShapeMembersForParamEntry(index.getParam(keyPath[0]), keyPath.slice(1));
  }

  const variableMatch = normalized.match(/^(\$[A-Za-z_]\w*)$/);
  if (variableMatch) {
    let members = resolveVariableArrayShape(document, lineNumber, variableMatch[1], index);
    for (const segment of keyPath) {
      const next = members.find((item) => item.name === segment);
      if (!next || !Array.isArray(next.children)) {
        return [];
      }

      members = next.children;
    }

    return members;
  }

  return [];
}

function getShapeMembersForParamEntry(entry, path) {
  if (!entry) {
    return [];
  }

  let current = entry;
  const keyPath = Array.isArray(path) ? path : [];
  for (const segment of keyPath) {
    if (!current || !Array.isArray(current.children)) {
      return [];
    }

    current = current.children.find((item) => item.name === segment);
  }

  if (current && Array.isArray(current.children) && current.children.length > 0) {
    return current.children;
  }

  return [];
}

function parseLiteralChain(chain) {
  const values = [];
  for (const match of String(chain).matchAll(/\[\s*['"]([^'"]+)['"]\s*\]/g)) {
    values.push(match[1]);
  }
  return values;
}

function mergeShapeMembers(groups) {
  const merged = new Map();
  for (const group of groups) {
    for (const item of group || []) {
      if (!merged.has(item.name)) {
        merged.set(item.name, item);
      }
    }
  }
  return Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name));
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
  resolveVariableLiteralOptions,
  resolveArrayShapeMembers
};

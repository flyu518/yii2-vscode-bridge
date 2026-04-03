'use strict';

const { parseDocblockProperties, parseDocblockReturnType } = require('./phpDocParser');

function parsePhpClass(content, sourceUri) {
  const lines = content.split(/\r?\n/);
  const namespace = extractNamespace(content);
  const uses = extractUses(content);
  const classMatch = content.match(/(?:\/\*\*[\s\S]*?\*\/\s*)?(?:abstract\s+)?class\s+([A-Za-z_]\w*)(?:\s+extends\s+([\\A-Za-z_][\\A-Za-z0-9_]*))?/);

  if (!classMatch) {
    return null;
  }

  const className = classMatch[1];
  const extendsType = classMatch[2] ? resolveType(classMatch[2], namespace, uses, className, undefined) : undefined;
  const fqcn = namespace ? `${namespace}\\${className}` : className;
  const classLine = findLine(lines, new RegExp(`class\\s+${className}\\b`));
  const docblock = extractDocblockBeforeClass(content, className);

  const properties = new Map();
  const methods = new Map();

  for (const property of parseDocblockProperties(docblock)) {
    properties.set(property.name, {
      name: property.name,
      type: resolveType(property.type, namespace, uses, fqcn, extendsType),
      sourceKind: 'class-docblock',
      line: classLine,
      detail: property.detail
    });
  }

  const propertyPattern = /(public|protected)\s+\$([A-Za-z_]\w*)\s*=\s*([^;]+);/g;
  let propertyMatch;
  while ((propertyMatch = propertyPattern.exec(content)) !== null) {
    const propertyDocblock = extractNearestDocblock(content, propertyMatch.index);
    const propertyName = propertyMatch[2];
    const propertyValue = propertyMatch[3];
    const declaredType = resolveType(parseDocblockVarType(propertyDocblock) || inferPropertyType(propertyValue), namespace, uses, fqcn, extendsType);
    const line = countLines(content.slice(0, propertyMatch.index));

    if (!properties.has(propertyName) && declaredType) {
      properties.set(propertyName, {
        name: propertyName,
        type: declaredType,
        sourceKind: 'class-property',
        line,
        detail: (propertyDocblock || propertyName).trim()
      });
    }
  }

  const methodPattern = /(\/\*\*[\s\S]*?\*\/\s*)?(public|protected)\s+function\s+([A-Za-z_]\w*)\s*\([^)]*\)(?:\s*:\s*([\\A-Za-z_][\\A-Za-z0-9_\|\[\]]*))?/g;
  let methodMatch;
  while ((methodMatch = methodPattern.exec(content)) !== null) {
    const methodDocblock = methodMatch[1] || '';
    const methodName = methodMatch[3];
    const getterMatch = methodName.match(/^get([A-Z][A-Za-z0-9_]*)$/);
    const propertyName = getterMatch ? lcfirst(getterMatch[1]) : undefined;
    const declaredReturn = methodMatch[4];
    const body = extractMethodBody(content, methodMatch.index);
    const relationType = inferRelationType(body, namespace, uses);
    const returnType = relationType || resolveType(declaredReturn || parseDocblockReturnType(methodDocblock), namespace, uses, fqcn, extendsType);
    const line = countLines(content.slice(0, methodMatch.index));

    methods.set(methodName, {
      name: methodName,
      propertyName,
      type: returnType,
      sourceKind: relationType ? 'relation-method' : getterMatch ? 'getter-method' : 'class-method',
      line,
      detail: (methodDocblock || methodName).trim()
    });

    if (propertyName && returnType && !properties.has(propertyName)) {
      properties.set(propertyName, {
        name: propertyName,
        type: returnType,
        sourceKind: relationType ? 'relation-method' : 'getter-method',
        line,
        detail: methodName
      });
    }
  }

  return {
    fqcn,
    className,
    namespace,
    extendsType,
    sourceUri,
    line: classLine,
    properties,
    methods
  };
}

function extractNamespace(content) {
  const match = content.match(/namespace\s+([^;]+);/);
  return match ? match[1].trim() : '';
}

function extractUses(content) {
  const uses = new Map();
  const pattern = /^use\s+([^;]+);/gm;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const full = match[1].trim();
    const aliasMatch = full.match(/^(.+?)\s+as\s+([A-Za-z_]\w*)$/i);
    if (aliasMatch) {
      uses.set(aliasMatch[2], aliasMatch[1]);
      continue;
    }

    const parts = full.split('\\');
    uses.set(parts[parts.length - 1], full);
  }

  return uses;
}

function extractDocblockBeforeClass(content, className) {
  const pattern = new RegExp('(\\/\\*\\*[\\s\\S]*?\\*\\/)\\s*(?:abstract\\s+)?class\\s+' + className + '\\b');
  const match = content.match(pattern);
  return match ? match[1] : '';
}

function extractMethodBody(content, startIndex) {
  const openBrace = content.indexOf('{', startIndex);
  if (openBrace === -1) {
    return '';
  }

  let depth = 0;
  for (let index = openBrace; index < content.length; index += 1) {
    if (content[index] === '{') {
      depth += 1;
    } else if (content[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return content.slice(openBrace, index + 1);
      }
    }
  }

  return content.slice(openBrace);
}

function extractNearestDocblock(content, startIndex) {
  const before = content.slice(0, startIndex);
  const matches = before.match(/\/\*\*[\s\S]*?\*\//g);
  return matches && matches.length > 0 ? matches[matches.length - 1] : '';
}

function inferRelationType(body, namespace, uses) {
  if (!body) {
    return undefined;
  }

  const hasOneMatch = body.match(/hasOne\(\s*([\\A-Za-z_][\\A-Za-z0-9_]*)::class(?:Name\(\))?/);
  if (hasOneMatch) {
    return resolveType(hasOneMatch[1], namespace, uses);
  }

  const hasManyMatch = body.match(/hasMany\(\s*([\\A-Za-z_][\\A-Za-z0-9_]*)::class(?:Name\(\))?/);
  if (hasManyMatch) {
    return `${resolveType(hasManyMatch[1], namespace, uses)}[]`;
  }

  return undefined;
}

function resolveType(typeName, namespace, uses, currentClass, parentClass) {
  if (!typeName) {
    return undefined;
  }

  const normalized = String(typeName).trim().replace(/^\?/, '');
  if (!normalized || normalized === 'null') {
    return undefined;
  }

  if (normalized.includes('|')) {
    const parts = normalized.split('|').map((part) => part.trim()).filter(Boolean);
    const preferred = parts.find((part) => part !== 'null') || parts[0];
    return resolveType(preferred, namespace, uses, currentClass, parentClass);
  }

  if (normalized.endsWith('[]')) {
    const inner = resolveType(normalized.slice(0, -2), namespace, uses, currentClass, parentClass);
    return inner ? `${inner}[]` : undefined;
  }

  if (isScalarType(normalized)) {
    return normalized;
  }

  if (normalized === 'self' || normalized === 'static') {
    return currentClass;
  }

  if (normalized === 'parent') {
    return parentClass;
  }

  if (normalized.startsWith('\\')) {
    return normalized.replace(/^\\/, '');
  }

  if (uses && uses.has(normalized)) {
    return uses.get(normalized);
  }

  if (normalized.includes('\\')) {
    return normalized;
  }

  return namespace ? `${namespace}\\${normalized}` : normalized;
}

function isScalarType(typeName) {
  return new Set(['int', 'string', 'bool', 'boolean', 'float', 'array', 'mixed', 'callable', 'object', 'void']).has(typeName);
}

function parseDocblockVarType(docblock) {
  const match = docblock.match(/@var\s+([^\s]+)/);
  return match ? match[1] : undefined;
}

function inferPropertyType(propertyValue) {
  const trimmed = String(propertyValue).trim();
  if (trimmed.startsWith('[')) {
    return 'array';
  }

  if (/^(true|false)$/.test(trimmed)) {
    return 'bool';
  }

  if (/^\d+$/.test(trimmed)) {
    return 'int';
  }

  return undefined;
}

function findLine(lines, pattern) {
  for (let index = 0; index < lines.length; index += 1) {
    if (pattern.test(lines[index])) {
      return index;
    }
  }

  return 0;
}

function countLines(text) {
  return text.split(/\r?\n/).length - 1;
}

function lcfirst(value) {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

module.exports = {
  parsePhpClass,
  resolveType
};

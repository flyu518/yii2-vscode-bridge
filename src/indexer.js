'use strict';

const path = require('path');
const vscode = require('vscode');
const { parseIdeStub } = require('./parsers/ideStubParser');
const { parseConfigComponents } = require('./parsers/configParser');
const { parsePhpClass } = require('./parsers/phpClassParser');
const { parseParamsFile } = require('./parsers/paramsParser');

const BUILT_IN_COMPONENTS = {
  db: 'yii\\db\\Connection',
  request: 'yii\\web\\Request',
  response: 'yii\\web\\Response',
  cache: 'yii\\caching\\CacheInterface',
  session: 'yii\\web\\Session',
  user: 'yii\\web\\User',
  urlManager: 'yii\\web\\UrlManager',
  errorHandler: 'yii\\web\\ErrorHandler'
};

class ProjectIndex {
  constructor() {
    this.components = new Map();
    this.classes = new Map();
    this.params = new Map();
  }

  upsertComponent(definition) {
    const existing = this.components.get(definition.name);
    if (!existing || rankSource(definition) >= rankSource(existing)) {
      this.components.set(definition.name, definition);
    }
  }

  addClass(definition) {
    this.classes.set(definition.fqcn, definition);
  }

  upsertParam(definition) {
    const existing = this.params.get(definition.name);
    if (!existing || rankSource(definition) >= rankSource(existing)) {
      this.params.set(definition.name, definition);
    }
  }

  getComponent(name) {
    return this.components.get(name);
  }

  getParam(name) {
    return this.params.get(name);
  }

  getParamChildEntries(name) {
    const entry = this.getParam(name);
    return entry && Array.isArray(entry.children) ? entry.children : [];
  }

  getParamChildEntry(name, childName) {
    return this.getParamChildEntries(name).find((entry) => entry.name === childName);
  }

  getClass(typeName) {
    if (!typeName) {
      return undefined;
    }

    const normalized = typeName.replace(/^\\/, '').replace(/\[\]$/, '');
    return this.classes.get(normalized);
  }

  getMembersForType(typeName) {
    const visited = new Set();
    const members = new Map();
    let current = this.getClass(typeName);

    while (current && !visited.has(current.fqcn)) {
      visited.add(current.fqcn);
      for (const property of current.properties.values()) {
        if (!members.has(property.name)) {
          members.set(property.name, {
            ...property,
            owner: current.fqcn,
            sourceUri: current.sourceUri
          });
        }
      }

      current = current.extendsType ? this.getClass(current.extendsType) : undefined;
    }

    return Array.from(members.values()).sort((left, right) => left.name.localeCompare(right.name));
  }

  getMethodsForType(typeName) {
    const visited = new Set();
    const methods = new Map();
    let current = this.getClass(typeName);

    while (current && !visited.has(current.fqcn)) {
      visited.add(current.fqcn);
      for (const method of current.methods.values()) {
        if (!methods.has(method.name)) {
          methods.set(method.name, {
            ...method,
            owner: current.fqcn,
            sourceUri: current.sourceUri
          });
        }
      }

      current = current.extendsType ? this.getClass(current.extendsType) : undefined;
    }

    return Array.from(methods.values()).sort((left, right) => left.name.localeCompare(right.name));
  }

  findMember(typeName, memberName) {
    return this.getMembersForType(typeName).find((member) => member.name === memberName);
  }

  findMethod(typeName, methodName) {
    return this.getMethodsForType(typeName).find((method) => method.name === methodName);
  }

  componentValues() {
    return Array.from(this.components.values()).sort((left, right) => left.name.localeCompare(right.name));
  }

  paramValues() {
    return Array.from(this.params.values()).sort((left, right) => left.name.localeCompare(right.name));
  }
}

async function buildProjectIndex() {
  const index = new ProjectIndex();
  const config = vscode.workspace.getConfiguration('yii2Bridge');
  const ideStubFiles = config.get('ideStubFiles', ['ide.php', 'config/__autocomplete.php']);
  const configFiles = config.get('configFiles', [
    'common/config/*.php',
    'common/config/*-local.php',
    'api/config/*.php',
    'api/config/*-local.php',
    'console/config/*.php',
    'console/config/*-local.php',
    'config/*.php'
  ]);
  const paramsFiles = config.get('paramsFiles', [
    'common/config/params*.php',
    'api/config/params*.php',
    'console/config/params*.php',
    'config/params*.php'
  ]);
  const classFiles = config.get('classFiles', [
    'api/**/*.php',
    'common/**/*.php',
    'console/**/*.php',
    'models/**/*.php',
    'controllers/**/*.php',
    'components/**/*.php',
    'services/**/*.php',
    'commands/**/*.php',
    'vendor/yiisoft/yii2/**/*.php'
  ]);
  const enableBuiltInComponents = config.get('enableBuiltInComponents', true);

  for (const pattern of ideStubFiles) {
    const uris = await vscode.workspace.findFiles(pattern);
    for (const uri of uris) {
      const content = await readWorkspaceFile(uri);
      for (const component of parseIdeStub(content, uri)) {
        index.upsertComponent(component);
      }
    }
  }

  for (const pattern of configFiles) {
    const uris = await vscode.workspace.findFiles(pattern);
    for (const uri of uris) {
      const content = await readWorkspaceFile(uri);
      for (const component of parseConfigComponents(content, uri)) {
        index.upsertComponent(component);
      }
    }
  }

  for (const pattern of paramsFiles) {
    const uris = await vscode.workspace.findFiles(pattern);
    for (const uri of uris) {
      const content = await readWorkspaceFile(uri);
      for (const entry of parseParamsFile(content, uri)) {
        index.upsertParam(entry);
      }
    }
  }

  if (enableBuiltInComponents) {
    for (const [name, type] of Object.entries(BUILT_IN_COMPONENTS)) {
      index.upsertComponent({
        name,
        type,
        sourceKind: 'built-in',
        sourceUri: undefined,
        line: undefined,
        detail: 'Built-in Yii component mapping'
      });
    }
  }

  for (const pattern of classFiles) {
    const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**');
    for (const uri of uris) {
      const content = await readWorkspaceFile(uri);
      const parsed = parsePhpClass(content, uri);
      if (parsed) {
        index.addClass(parsed);
      }
    }
  }

  return index;
}

async function readWorkspaceFile(uri) {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString('utf8');
}

async function resolveClassFile(typeName) {
  if (!typeName) {
    return null;
  }

  const normalized = typeName.replace(/^\\/, '').replace(/\[\]$/, '');
  const relativePath = normalized.replace(/\\/g, '/') + '.php';
  const searchPatterns = [
    `vendor/**/${relativePath}`,
    `**/${relativePath}`
  ];

  for (const pattern of searchPatterns) {
    const uris = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 1);
    if (uris.length > 0) {
      return uris[0];
    }
  }

  return null;
}

function getShortPath(uri) {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) {
    return uri.fsPath;
  }

  return path.relative(folder.uri.fsPath, uri.fsPath);
}

function rankSource(definition) {
  const base = (() => {
    switch (definition.sourceKind) {
      case 'ide.php':
        return 30;
      case 'config':
        return 20;
      case 'built-in':
        return 10;
      default:
        return 0;
    }
  })();

  const localBoost = definition.sourceUri && /-local\.php$/.test(definition.sourceUri.fsPath) ? 5 : 0;
  return base + localBoost;
}

module.exports = {
  buildProjectIndex,
  resolveClassFile,
  getShortPath,
  ProjectIndex
};

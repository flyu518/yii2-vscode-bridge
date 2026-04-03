'use strict';

const COMPONENT_ENTRY_PATTERN = /^\s*['"]([A-Za-z_]\w*)['"]\s*=>\s*\[\s*$/;
const CLASS_LINE_PATTERN = /^\s*['"]class['"]\s*=>\s*(.+)$/;

function parseConfigComponents(content, sourceUri) {
  const lines = content.split(/\r?\n/);
  const componentsLine = findComponentsLine(lines);

  if (componentsLine === -1) {
    return [];
  }

  const results = [];
  let depth = bracketDelta(lines[componentsLine]);
  let currentComponent = null;
  let currentDepth = 0;

  for (let index = componentsLine + 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (currentComponent) {
      const classMatch = line.match(CLASS_LINE_PATTERN);
      if (classMatch && !currentComponent.type) {
        currentComponent.type = normalizeClassValue(classMatch[1]);
        currentComponent.detail = line.trim();
      }
    }

    const componentMatch = !currentComponent && line.match(COMPONENT_ENTRY_PATTERN);
    if (componentMatch && depth === 1) {
      currentComponent = {
        name: componentMatch[1],
        type: undefined,
        sourceKind: 'config',
        sourceUri,
        line: index,
        detail: line.trim()
      };
      currentDepth = depth;
    }

    const delta = bracketDelta(line);
    depth += delta;

    if (currentComponent && depth === currentDepth) {
      results.push(currentComponent);
      currentComponent = null;
      currentDepth = 0;
    }

    if (depth <= 0) {
      break;
    }
  }

  return results;
}

function findComponentsLine(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    if (/['"]components['"]\s*=>\s*\[/.test(lines[index])) {
      return index;
    }
  }

  return -1;
}

function normalizeClassValue(rawValue) {
  if (!rawValue) {
    return undefined;
  }

  const trimmed = rawValue.trim();
  const withoutComment = trimmed.replace(/\s*\/\/.*$/, '').replace(/,\s*$/, '').trim();
  const stringMatch = withoutComment.match(/^['"](.+?)['"]$/);
  if (stringMatch) {
    return stringMatch[1].replace(/\\\\/g, '\\');
  }

  const classConstMatch = withoutComment.match(/^([\\A-Za-z_][\\A-Za-z0-9_]*)::class$/);
  if (classConstMatch) {
    return classConstMatch[1].replace(/\\\\/g, '\\');
  }

  return undefined;
}

function bracketDelta(line) {
  let delta = 0;
  for (const char of line) {
    if (char === '[') {
      delta += 1;
    } else if (char === ']') {
      delta -= 1;
    }
  }

  return delta;
}

module.exports = {
  parseConfigComponents,
  normalizeClassValue
};

'use strict';

function parseParamsFile(content, sourceUri) {
  const lines = content.split(/\r?\n/);
  const startLine = findReturnArrayLine(lines);
  if (startLine === -1) {
    return [];
  }

  const entries = [];
  let depth = bracketDelta(lines[startLine]);

  for (let index = startLine + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const codeLine = stripLineComment(line);
    const keyMatch = depth === 1 ? codeLine.match(/^\s*['"]([^'"]+)['"]\s*=>\s*(.+?)\s*,?\s*$/) : null;
    if (keyMatch) {
      const name = keyMatch[1];
      const valueExpression = keyMatch[2];
      const entry = {
        name,
        sourceKind: 'params',
        sourceUri,
        line: index,
        detail: codeLine.trim(),
        type: inferValueType(valueExpression),
        children: []
      };

      if (isMultilineArray(valueExpression)) {
        const child = parseNestedChildren(lines, sourceUri, index + 1);
        entry.children = child.entries;
        index = child.endLine;
        entries.push(entry);
        continue;
      }

      entries.push(entry);
    }

    depth += bracketDelta(codeLine);
    if (depth <= 0) {
      break;
    }
  }

  return entries;
}

function parseNestedChildren(lines, sourceUri, startLine) {
  const entries = [];
  let depth = 1;

  for (let index = startLine; index < lines.length; index += 1) {
    const line = lines[index];
    const codeLine = stripLineComment(line);
    const keyMatch = depth === 1 ? codeLine.match(/^\s*['"]([^'"]+)['"]\s*=>\s*(.+?)\s*,?\s*$/) : null;
    if (keyMatch) {
      const name = keyMatch[1];
      const valueExpression = keyMatch[2];
      const entry = {
        name,
        sourceKind: 'params-child',
        sourceUri,
        line: index,
        detail: codeLine.trim(),
        type: inferValueType(valueExpression),
        children: []
      };

      if (isMultilineArray(valueExpression)) {
        const child = parseNestedChildren(lines, sourceUri, index + 1);
        entry.children = child.entries;
        index = child.endLine;
        entries.push(entry);
        continue;
      }

      entries.push(entry);
    }

    depth += bracketDelta(codeLine);
    if (depth <= 0) {
      return {
        entries,
        endLine: index
      };
    }
  }

  return {
    entries,
    endLine: lines.length - 1
  };
}

function inferValueType(valueExpression) {
  const trimmed = String(valueExpression).trim();
  if (trimmed.startsWith('[')) {
    return 'array';
  }
  if (/^['"]/.test(trimmed)) {
    return 'string';
  }
  if (/^\d+$/.test(trimmed)) {
    return 'int';
  }
  if (/^(true|false)$/.test(trimmed)) {
    return 'bool';
  }
  if (/^\$/.test(trimmed)) {
    return 'mixed';
  }
  return 'mixed';
}

function findReturnArrayLine(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    if (/return\s*\[/.test(lines[index])) {
      return index;
    }
  }

  return -1;
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

function isMultilineArray(valueExpression) {
  const trimmed = String(valueExpression).trim();
  return trimmed.startsWith('[') && bracketDelta(trimmed) > 0;
}

function stripLineComment(line) {
  let result = '';
  let quote = null;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      result += char;
      escaped = true;
      continue;
    }

    if (quote) {
      result += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '\'' || char === '"') {
      result += char;
      quote = char;
      continue;
    }

    if (char === '#' || (char === '/' && next === '/')) {
      break;
    }

    result += char;
  }

  return result;
}

module.exports = {
  parseParamsFile
};

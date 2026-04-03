'use strict';

const vscode = require('vscode');

async function applyWorkspaceSettings() {
  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length === 0) {
    vscode.window.showWarningMessage('Yii2 Bridge needs an open workspace folder.');
    return;
  }

  const settingsUri = vscode.Uri.joinPath(folders[0].uri, '.vscode', 'settings.json');
  const nextSettings = {
    'files.associations': {
      '*.inc': 'php'
    },
    'intelephense.files.associations': [
      '*.php',
      '*.inc',
      '*.module',
      '*.phtml'
    ],
    'intelephense.diagnostics.undefinedProperties': false,
    'intelephense.diagnostics.undefinedMethods': true,
    'intelephense.environment.includePaths': [
      '${workspaceFolder}'
    ]
  };

  let currentSettings = {};
  try {
    const existing = await vscode.workspace.fs.readFile(settingsUri);
    currentSettings = JSON.parse(Buffer.from(existing).toString('utf8'));
  } catch (error) {
    currentSettings = {};
  }

  const merged = deepMerge(currentSettings, nextSettings);

  await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folders[0].uri, '.vscode'));
  await vscode.workspace.fs.writeFile(settingsUri, Buffer.from(JSON.stringify(merged, null, 2) + '\n', 'utf8'));
  vscode.window.showInformationMessage('Yii2 Bridge workspace settings updated.');
}

function deepMerge(left, right) {
  if (!isPlainObject(left) || !isPlainObject(right)) {
    return right;
  }

  const merged = { ...left };
  for (const [key, value] of Object.entries(right)) {
    if (Array.isArray(value)) {
      merged[key] = value.slice();
      continue;
    }

    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = deepMerge(merged[key], value);
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

module.exports = {
  applyWorkspaceSettings,
  deepMerge
};

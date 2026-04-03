'use strict';

const vscode = require('vscode');
const { buildProjectIndex } = require('./indexer');
const { YiiAppCompletionProvider } = require('./providers/completionProvider');
const { YiiAppHoverProvider } = require('./providers/hoverProvider');
const { YiiAppDefinitionProvider } = require('./providers/definitionProvider');
const { applyWorkspaceSettings } = require('./commands/applyWorkspaceSettings');
const { inspectSymbol } = require('./commands/inspectSymbol');

async function activate(context) {
  let projectIndex = await buildProjectIndex();

  async function reindexProject(showMessage) {
    projectIndex = await buildProjectIndex();
    if (showMessage) {
      vscode.window.showInformationMessage(`Yii2 Bridge indexed ${projectIndex.componentValues().length} components and ${projectIndex.classes.size} classes.`);
    }
  }

  const selector = { language: 'php', scheme: 'file' };

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      selector,
      new YiiAppCompletionProvider(() => projectIndex),
      '>',
      "'",
      '"'
    ),
    vscode.languages.registerHoverProvider(selector, new YiiAppHoverProvider(() => projectIndex)),
    vscode.languages.registerDefinitionProvider(selector, new YiiAppDefinitionProvider(() => projectIndex)),
    vscode.commands.registerCommand('yii2Bridge.applyWorkspaceSettings', applyWorkspaceSettings),
    vscode.commands.registerCommand('yii2Bridge.reindex', () => reindexProject(true)),
    vscode.commands.registerCommand('yii2Bridge.inspectSymbol', () => inspectSymbol(() => projectIndex)),
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      if (!document.fileName.endsWith('.php')) {
        return;
      }

      if (/[/\\](config|models|components|common|api|console|vendor[/\\]yiisoft[/\\]yii2)[/\\]/.test(document.fileName) || document.fileName.endsWith('ide.php')) {
        await reindexProject(false);
      }
    })
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};

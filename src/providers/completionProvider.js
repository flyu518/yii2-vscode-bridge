'use strict';

const vscode = require('vscode');
const { resolveCompletionContext } = require('../resolver');

class YiiAppCompletionProvider {
  constructor(getIndex) {
    this.getIndex = getIndex;
  }

  provideCompletionItems(document, position) {
    const context = resolveCompletionContext(document, position, this.getIndex());
    if (!context) {
      return [];
    }

    return context.items.map((item) => {
      const kind = item.memberKind === 'method' ? vscode.CompletionItemKind.Method : vscode.CompletionItemKind.Property;
      const completion = new vscode.CompletionItem(item.name, kind);
      completion.detail = item.type || item.sourceKind || context.receiverType || 'unknown';
      completion.documentation = new vscode.MarkdownString(buildDocumentation(item, context));
      completion.insertText = item.memberKind === 'method' ? `${item.name}()` : item.name;
      return completion;
    });
  }
}

function buildDocumentation(item, context) {
  const lines = [
    `**${item.name}**`,
    '',
    `Type: \`${item.type || 'unknown'}\``,
    `Source: \`${item.sourceKind || 'unknown'}\``,
    `Member Kind: \`${item.memberKind || 'property'}\``
  ];

  if (context.receiverType) {
    lines.push(`Receiver: \`${context.receiverType}\``);
  }

  if (item.detail) {
    lines.push('', `Hint: \`${item.detail}\``);
  }

  return lines.join('\n');
}

module.exports = {
  YiiAppCompletionProvider
};

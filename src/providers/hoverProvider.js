'use strict';

const vscode = require('vscode');
const { getShortPath } = require('../indexer');
const { resolveMemberContext } = require('../resolver');
const { getCompletedParamsAccessContext } = require('../context');
const { resolveVariableLiteralOptions } = require('../resolver');

class YiiAppHoverProvider {
  constructor(getIndex) {
    this.getIndex = getIndex;
  }

  provideHover(document, position) {
    const paramsAccess = getCompletedParamsAccessContext(document, position);
    if (paramsAccess && paramsAccess.keyKind === 'variable') {
      const options = resolveVariableLiteralOptions(document, position.line, paramsAccess.keyName);
      if (options.length > 0) {
        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`**Yii params key candidates** \`${paramsAccess.keyName}\`\n\n`);
        markdown.appendMarkdown(`- Candidates: \`${options.join(' | ')}\``);
        markdown.appendMarkdown('\n- Source: static local code analysis');
        markdown.appendMarkdown('\n- Note: this is not runtime value evaluation');
        return new vscode.Hover(markdown, paramsAccess.range);
      }
    }

    const context = resolveMemberContext(document, position, this.getIndex());
    if (!context) {
      return null;
    }

    const markdown = new vscode.MarkdownString();
    markdown.appendMarkdown(`**Yii ${context.kind === 'method' ? 'method' : 'member'}** \`${context.member.name}\`\n\n`);
    markdown.appendCodeblock(context.member.type || 'unknown', 'php');
    markdown.appendMarkdown('\n');
    markdown.appendMarkdown(`\n- Receiver: \`${context.receiverType}\``);
    markdown.appendMarkdown(`\n- Source Kind: \`${context.member.sourceKind || 'unknown'}\``);

    if (context.member.owner) {
      markdown.appendMarkdown(`\n- Owner: \`${context.member.owner}\``);
    }

    if (context.member.sourceUri) {
      markdown.appendMarkdown(`\n- Source File: \`${getShortPath(context.member.sourceUri)}\``);
    }

    if (typeof context.member.line === 'number') {
      markdown.appendMarkdown(`\n- Source Line: \`${context.member.line + 1}\``);
    }

    if (context.member.detail) {
      markdown.appendMarkdown(`\n- Resolved From: \`${oneLine(context.member.detail)}\``);
    }

    return new vscode.Hover(markdown, context.range);
  }
}

function oneLine(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

module.exports = {
  YiiAppHoverProvider
};

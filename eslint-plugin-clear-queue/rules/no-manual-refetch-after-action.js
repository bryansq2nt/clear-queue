/**
 * @fileoverview Disallow await serverAction() followed by await load*() in the same function.
 * Prefer router.refresh() or letting the server component re-fetch instead of manual load*().
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow manual refetch (await load*()) after a server action in the same function',
      category: 'Best Practices',
      recommended: true,
    },
    schema: [],
    messages: {
      noManualRefetch:
        'Avoid calling await load*() after a server action in the same function. Prefer router.refresh() or returning data from the action so the UI updates without manual refetch.',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode?.() ?? context.getSourceCode();

    function getCalleeName(node) {
      const callee = node.callee;
      if (callee.type === 'Identifier') return callee.name;
      if (
        callee.type === 'MemberExpression' &&
        callee.property.type === 'Identifier'
      ) {
        return callee.property.name;
      }
      return null;
    }

    function isActionCall(name) {
      return (
        typeof name === 'string' && name.endsWith('Action') && name !== 'Action'
      );
    }

    function isLoadCall(name) {
      return typeof name === 'string' && /^load[A-Z]/.test(name);
    }

    const FUNCTION_TYPES = new Set([
      'ArrowFunctionExpression',
      'FunctionExpression',
      'FunctionDeclaration',
    ]);

    const STRUCTURAL_KEYS = new Set([
      'body',
      'expression',
      'argument',
      'arguments',
      'callee',
      'block',
      'test',
      'consequent',
      'alternate',
      'declarations',
      'declaration',
      'init',
      'update',
      'left',
      'right',
      'elements',
      'properties',
      'value',
      'key',
      'argument',
      'params',
      'id',
      'bodies',
      'handler',
      'finalizer',
      'object',
      'property',
      'cases',
      'discriminant',
      'quasi',
      'expressions',
      'tag',
      'specifiers',
      'source',
      'attributes',
      'program',
      'filter',
      'guard',
    ]);

    function getAwaitCallsInFunction(body) {
      const calls = [];
      const seen = new Set();
      function visit(node) {
        if (!node || seen.has(node)) return;
        seen.add(node);
        if (
          node.type === 'AwaitExpression' &&
          node.argument?.type === 'CallExpression'
        ) {
          const name = getCalleeName(node.argument);
          if (name) calls.push({ node: node.argument, name, loc: node.loc });
        }
        if (FUNCTION_TYPES.has(node.type)) return;
        for (const key of STRUCTURAL_KEYS) {
          const child = node[key];
          if (child && typeof child === 'object') {
            if (Array.isArray(child)) {
              child.forEach(visit);
            } else {
              visit(child);
            }
          }
        }
      }
      visit(body);
      return calls;
    }

    function checkFunction(node) {
      let body = node.body;
      if (
        node.type === 'ArrowFunctionExpression' &&
        body.type !== 'BlockStatement'
      ) {
        body = {
          type: 'BlockStatement',
          body: [{ type: 'ReturnStatement', argument: body }],
        };
      }
      if (!body || body.type !== 'BlockStatement') return;
      const awaitCalls = getAwaitCallsInFunction(body);
      const ordered = awaitCalls.sort((a, b) =>
        a.loc.start.line !== b.loc.start.line
          ? a.loc.start.line - b.loc.start.line
          : a.loc.start.column - b.loc.start.column
      );
      let seenAction = false;
      for (const { node: callNode, name } of ordered) {
        if (isActionCall(name)) seenAction = true;
        if (seenAction && isLoadCall(name)) {
          context.report({
            node: callNode,
            messageId: 'noManualRefetch',
          });
          return;
        }
      }
    }

    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
    };
  },
};

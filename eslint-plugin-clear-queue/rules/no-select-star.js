/**
 * @fileoverview Disallow .select('*') in Supabase queries to encourage explicit column lists.
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: "Disallow .select('*') in Supabase queries",
      category: 'Best Practices',
      recommended: true,
    },
    schema: [],
    messages: {
      noSelectStar:
        "Avoid .select('*'). Specify the columns you need (e.g. .select('id, name')) for smaller payloads and clearer contracts.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== 'MemberExpression' ||
          callee.property.type !== 'Identifier' ||
          callee.property.name !== 'select'
        ) {
          return;
        }
        const args = node.arguments;
        if (args.length === 0) return;
        const first = args[0];
        if (first.type !== 'Literal' || first.value !== '*') return;
        context.report({
          node: callee.property,
          messageId: 'noSelectStar',
        });
      },
    };
  },
};

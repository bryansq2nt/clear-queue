/**
 * @fileoverview Disallow createClient() from @/lib/supabase/client in 'use client' components.
 * Components and *Client.tsx pages should use server actions / server Supabase, not the browser client.
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Disallow createClient() in files with 'use client' under components/ or app/**/*Client.tsx",
      category: 'Best Practices',
      recommended: true,
    },
    schema: [],
    messages: {
      noClientSupabase:
        "Do not use createClient() in client components. Use server actions or pass data from server instead. File has 'use client' and matches components/* or app/**/*Client.tsx.",
    },
  },
  create(context) {
    const filename = context.getFilename?.() ?? context.filename ?? '';
    const sourceCode = context.getSourceCode?.() ?? context.getSourceCode();
    const text = sourceCode.getText();

    const hasUseClient = /['"]use client['"]/.test(text);
    const isComponentPath =
      /[/\\]components[/\\]/.test(filename) ||
      /[/\\]app[/\\].*Client\.tsx$/.test(filename);

    if (!hasUseClient || !isComponentPath) {
      return {};
    }

    return {
      CallExpression(node) {
        const callee = node.callee;
        const name =
          callee.type === 'Identifier'
            ? callee.name
            : callee.type === 'MemberExpression' &&
                callee.property.type === 'Identifier'
              ? callee.property.name
              : null;
        if (name === 'createClient') {
          context.report({
            node: callee,
            messageId: 'noClientSupabase',
          });
        }
      },
    };
  },
};

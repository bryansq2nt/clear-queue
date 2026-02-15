module.exports = {
  root: true,
  extends: ['next/core-web-vitals'],
  plugins: ['clear-queue'],
  rules: {
    'react-hooks/exhaustive-deps': 'error',
    'react/no-unescaped-entities': 'error',
    '@next/next/no-html-link-for-pages': 'error',
    'clear-queue/no-select-star': 'error',
    'clear-queue/no-manual-refetch-after-action': 'error',
  },
  overrides: [
    {
      files: ['components/**/*.{ts,tsx}', 'app/**/*Client.tsx'],
      rules: {
        'clear-queue/no-client-supabase-in-components': 'error',
      },
    },
  ],
};

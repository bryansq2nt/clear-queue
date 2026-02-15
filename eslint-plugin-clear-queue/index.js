const noClientSupabaseInComponents = require('./rules/no-client-supabase-in-components');
const noSelectStar = require('./rules/no-select-star');
const noManualRefetchAfterAction = require('./rules/no-manual-refetch-after-action');

module.exports = {
  rules: {
    'no-client-supabase-in-components': noClientSupabaseInComponents,
    'no-select-star': noSelectStar,
    'no-manual-refetch-after-action': noManualRefetchAfterAction,
  },
};

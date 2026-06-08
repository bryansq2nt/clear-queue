import {
  DEFAULT_USER_EMAIL,
  DEFAULT_USER_ID,
  DEFAULT_USER_PASSWORD,
  OWNER_ROLE_ID,
} from './constants';

export type LocalStore = {
  auth: {
    users: Array<{ id: string; email: string; password: string }>;
  };
  tables: Record<string, Record<string, unknown>[]>;
};

const now = () => new Date().toISOString();

export function createSeedStore(): LocalStore {
  const timestamp = now();

  return {
    auth: {
      users: [
        {
          id: DEFAULT_USER_ID,
          email: DEFAULT_USER_EMAIL,
          password: DEFAULT_USER_PASSWORD,
        },
      ],
    },
    tables: {
      profiles: [
        {
          user_id: DEFAULT_USER_ID,
          display_name: 'Bryan',
          phone: null,
          timezone: 'America/New_York',
          locale: 'en',
          avatar_asset_id: null,
          created_at: timestamp,
          updated_at: timestamp,
        },
      ],
      user_preferences: [
        {
          user_id: DEFAULT_USER_ID,
          theme_mode: 'system',
          primary_color: '#05668D',
          secondary_color: '#0B132B',
          third_color: '#F4F7FB',
          currency: 'USD',
          company_logo_asset_id: null,
          cover_image_asset_id: null,
          created_at: timestamp,
          updated_at: timestamp,
        },
      ],
      rbac_roles: [
        {
          id: OWNER_ROLE_ID,
          name: 'owner',
          is_system_role: true,
          created_at: timestamp,
        },
        {
          id: 'b0000000-0000-4000-a000-000000000002',
          name: 'team_member',
          is_system_role: true,
          created_at: timestamp,
        },
        {
          id: 'b0000000-0000-4000-a000-000000000003',
          name: 'team_manager',
          is_system_role: true,
          created_at: timestamp,
        },
        {
          id: 'b0000000-0000-4000-a000-000000000004',
          name: 'project_manager',
          is_system_role: true,
          created_at: timestamp,
        },
        {
          id: 'b0000000-0000-4000-a000-000000000005',
          name: 'guest',
          is_system_role: true,
          created_at: timestamp,
        },
      ],
      projects: [],
      tasks: [],
      notes: [],
      note_links: [],
      project_note_folders: [],
      link_categories: [],
      project_links: [],
      clients: [],
      businesses: [],
      ideas: [],
      idea_connections: [],
      idea_project_links: [],
      idea_boards: [],
      idea_board_items: [],
      budgets: [],
      budget_categories: [],
      budget_items: [],
      billings: [],
      billing_categories: [],
      todo_lists: [],
      todo_items: [],
      calendar_events: [],
      project_document_folders: [],
      project_files: [],
      user_assets: [],
      project_favorites: [],
      project_access: [],
      project_members: [],
      user_role_assignments: [],
      project_modules: [],
      milestones: [],
      task_activity_log: [],
      organizations: [],
      organization_members: [],
      user_project_access_grants: [],
      rbac_module_actions: [],
      rbac_role_module_actions: [],
      project_teams: [],
      project_team_members: [],
      user_in_app_notifications: [],
      copilot_sessions: [],
      copilot_messages: [],
      copilot_proposals: [],
      media_share_tokens: [],
      plan_quotas: [],
      project_invites: [],
    },
  };
}

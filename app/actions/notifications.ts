'use server';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';

export type AppNotification = {
  id: string;
  type: 'project_invite';
  projectName: string;
  roleName: string;
  href: string;
  created_at: string;
};

export const listMyNotifications = cache(
  async (): Promise<AppNotification[]> => {
    await requireAuth();
    const supabase = await createClient();
    const { data } = await (supabase as any).rpc(
      'get_my_pending_invite_notifications'
    );

    return (data ?? []).map((row: any) => {
      const projectName = row?.project_name ?? 'Project';
      const roleName = row?.role_name ?? 'member';
      return {
        id: row.id as string,
        type: 'project_invite' as const,
        projectName,
        roleName,
        href: `/invite/${row.token as string}`,
        created_at: row.created_at as string,
      };
    });
  }
);

export const getMyNotificationsCount = cache(async (): Promise<number> => {
  const items = await listMyNotifications();
  return items.length;
});

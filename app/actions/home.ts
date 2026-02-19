'use server';

import { getUser } from '@/lib/auth';
import { getProfileOptional } from '@/app/settings/profile/actions';
import { getProjectsList, type ProjectListItem } from '@/app/actions/projects';

/**
 * Data for the home project picker. Used when pre-rendering the "Salir" target
 * so the transition shows content sliding in, not a blank load.
 */
export type HomePageData = {
  projects: ProjectListItem[];
  userDisplayName: string;
};

export async function getHomePageData(): Promise<HomePageData | null> {
  const user = await getUser();
  if (!user) return null;

  const [projects, profile] = await Promise.all([
    getProjectsList(),
    getProfileOptional(),
  ]);
  const userDisplayName =
    profile?.display_name?.trim() || user.email?.split('@')[0] || 'User';

  return { projects, userDisplayName };
}

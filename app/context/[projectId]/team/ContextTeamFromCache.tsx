'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  listProjectMembers,
  listPendingInvites,
  listProjectRoles,
  listProjectAccessProfiles,
  listReusableInviteRoles,
} from '@/app/actions/teams';
import type {
  ProjectMember,
  ProjectInvite,
  ProjectAccessProfile,
  InviteRole,
} from '@/app/actions/teams';
import { SkeletonTeam } from '@/components/skeletons/SkeletonTeam';
import { useContextDataCache } from '../../ContextDataCache';
import ContextTeamClient from './ContextTeamClient';

type TeamData = {
  members: ProjectMember[];
  invites: ProjectInvite[];
  roles: Array<{ id: string; name: string; description: string | null }>;
  profiles: ProjectAccessProfile[];
  reusableRoles: InviteRole[];
};

interface Props {
  projectId: string;
}

export default function ContextTeamFromCache({ projectId }: Props) {
  const cache = useContextDataCache();
  const cached = cache.get<TeamData>({ type: 'team', projectId });
  const [data, setData] = useState<TeamData | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    cache.invalidate({ type: 'team', projectId });
    setLoadError(null);
    try {
      const [members, invites, roles, profiles, reusableRoles] =
        await Promise.all([
          listProjectMembers(projectId),
          listPendingInvites(projectId),
          listProjectRoles(),
          listProjectAccessProfiles(projectId),
          listReusableInviteRoles(projectId),
        ]);
      const next: TeamData = {
        members,
        invites,
        roles,
        profiles,
        reusableRoles,
      };
      cache.set({ type: 'team', projectId }, next);
      setData(next);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Failed to load team data'
      );
    }
  }, [projectId, cache]);

  useEffect(() => {
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listProjectMembers(projectId),
      listPendingInvites(projectId),
      listProjectRoles(),
      listProjectAccessProfiles(projectId),
      listReusableInviteRoles(projectId),
    ])
      .then(([members, invites, roles, profiles, reusableRoles]) => {
        if (cancelled) return;
        const next: TeamData = {
          members,
          invites,
          roles,
          profiles,
          reusableRoles,
        };
        cache.set({ type: 'team', projectId }, next);
        setData(next);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : 'Failed to load team data'
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, cached, cache]);

  if (loading) return <SkeletonTeam />;

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <button
          onClick={loadData}
          className="text-sm underline underline-offset-2 text-muted-foreground hover:text-foreground"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) return <SkeletonTeam />;

  return (
    <ContextTeamClient
      projectId={projectId}
      initialMembers={data.members}
      initialInvites={data.invites}
      roles={data.roles}
      profiles={data.profiles}
      reusableRoles={data.reusableRoles}
      onRefresh={loadData}
    />
  );
}

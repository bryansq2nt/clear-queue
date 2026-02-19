'use client';

import { useEffect } from 'react';
import { ContextShell } from '@/components/context/ContextShell';
import { recordProjectAccess } from '@/app/actions/projects';

interface ContextLayoutClientProps {
  projectId: string;
  projectName: string;
  children: React.ReactNode;
}

export default function ContextLayoutClient({
  projectId,
  projectName,
  children,
}: ContextLayoutClientProps) {
  useEffect(() => {
    void recordProjectAccess(projectId);
  }, [projectId]);

  return (
    <ContextShell projectId={projectId} projectName={projectName}>
      {children}
    </ContextShell>
  );
}

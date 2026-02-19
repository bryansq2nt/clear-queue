'use client';

import { ContextShell } from '@/components/context/ContextShell';

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
  return (
    <ContextShell projectId={projectId} projectName={projectName}>
      {children}
    </ContextShell>
  );
}

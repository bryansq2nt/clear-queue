'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useState } from 'react';
import { EditProjectModal } from '@/components/EditProjectModal';
import { cn } from '@/lib/utils';
import type { Database } from '@/lib/supabase/types';

type Project = Database['public']['Tables']['projects']['Row'];

interface ProjectContextNavProps {
  project: Project;
}

const PROJECT_TABS = [
  { label: 'Overview', segment: '' },
  { label: 'Tasks', segment: 'tasks' },
  { label: 'Budget', segment: 'budget' },
  { label: 'Ideas', segment: 'ideas' },
  { label: 'CRM', segment: 'crm' },
  { label: 'Notes', segment: 'notes' },
  { label: 'Files', segment: 'files' },
] as const;

export function ProjectContextNav({ project }: ProjectContextNavProps) {
  const pathname = usePathname();
  const [isEditOpen, setIsEditOpen] = useState(false);

  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="px-4 sm:px-6 py-3 flex items-center gap-3">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Todos los proyectos
        </Link>
        <h1 className="text-base sm:text-lg font-semibold text-foreground truncate flex-1 text-center sm:text-left">
          {project.name}
        </h1>
        <button
          type="button"
          onClick={() => setIsEditOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-accent"
        >
          <Pencil className="h-3.5 w-3.5" />
          Editar
        </button>
      </div>

      <nav className="px-4 sm:px-6 overflow-x-auto">
        <ul className="flex items-center gap-1 min-w-max">
          {PROJECT_TABS.map((tab) => {
            const href = tab.segment
              ? `/project/${project.id}/${tab.segment}`
              : `/project/${project.id}`;
            const isActive =
              pathname === href ||
              (tab.segment !== '' && pathname.startsWith(`${href}/`));

            return (
              <li key={tab.label}>
                <Link
                  href={href}
                  className={cn(
                    'inline-flex items-center border-b-2 px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <EditProjectModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onProjectUpdated={() => setIsEditOpen(false)}
        project={project}
      />
    </div>
  );
}

import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';
import { ProjectContextNav } from '@/components/project/ProjectContextNav';

export default async function ProjectContextLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  await requireAuth();
  const { id } = await params;
  const project = await getProjectById(id);

  if (!project) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <ProjectContextNav project={project} />
      <main className="p-4 sm:p-6">{children}</main>
    </div>
  );
}

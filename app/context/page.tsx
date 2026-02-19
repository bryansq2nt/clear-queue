import { requireAuth } from '@/lib/auth';
import { getProjectsList } from '@/app/actions/projects';
import ContextProjectPicker from './ContextProjectPicker';

export default async function ContextPage() {
  await requireAuth();
  const projects = await getProjectsList();

  return (
    <ContextProjectPicker initialProjects={projects} />
  );
}

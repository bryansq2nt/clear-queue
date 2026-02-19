import { requireAuth } from '@/lib/auth';
import { getProjectById } from '@/app/actions/projects';
import { getClientById, getBusinessById } from '@/app/clients/actions';
import ContextOwnerClient from './ContextOwnerClient';

export default async function ContextOwnerPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const project = await getProjectById(params.projectId);

  if (!project) {
    return null;
  }

  const [client, business] = await Promise.all([
    project.client_id
      ? getClientById(project.client_id)
      : Promise.resolve(null),
    project.business_id
      ? getBusinessById(project.business_id)
      : Promise.resolve(null),
  ]);

  return (
    <ContextOwnerClient project={project} client={client} business={business} />
  );
}

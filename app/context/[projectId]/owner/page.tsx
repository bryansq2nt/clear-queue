import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import {
  getOwnerPermissions,
  getClientById,
  getBusinessById,
} from '@/app/actions/clients';
import { getProjectById } from '@/app/actions/projects';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextOwnerClient from './ContextOwnerClient';

export default async function ContextOwnerPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;
  const [{ canView, reason }, permissions, project] = await Promise.all([
    getCanViewModule(projectId, 'owner'),
    getOwnerPermissions(projectId),
    getProjectById(projectId),
  ]);
  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="owner"
        projectId={projectId}
        reason={reason}
      />
    );
  }
  if (!project) return null;
  const [client, business] = await Promise.all([
    project.client_id
      ? getClientById(project.client_id)
      : Promise.resolve(null),
    project.business_id
      ? getBusinessById(project.business_id)
      : Promise.resolve(null),
  ]);
  return (
    <ContextOwnerClient
      project={project}
      client={client}
      business={business}
      permissions={permissions}
    />
  );
}

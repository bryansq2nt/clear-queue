import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import { getProjectById } from '@/app/actions/projects';
import {
  getBillingsPermissions,
  getBillingsByProjectId,
  getBillingCategories,
} from '@/app/actions/billings';
import { getClients } from '@/app/actions/clients';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextBillingsClient from './ContextBillingsClient';

export default async function ContextBillingsPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;

  const [
    { canView, reason },
    project,
    permissions,
    billings,
    categories,
    clients,
  ] = await Promise.all([
    getCanViewModule(projectId, 'billings'),
    getProjectById(projectId),
    getBillingsPermissions(projectId),
    getBillingsByProjectId(projectId),
    getBillingCategories(),
    getClients(),
  ]);

  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="billings"
        projectId={projectId}
        reason={reason}
      />
    );
  }

  return (
    <ContextBillingsClient
      projectId={projectId}
      initialBillings={billings}
      initialClients={clients as { id: string; full_name: string }[]}
      initialCategories={categories}
      projectClientId={project?.client_id ?? null}
      permissions={permissions}
    />
  );
}

import { requireAuth } from '@/lib/auth';
import { getCanViewModule } from '@/app/actions/modules';
import {
  getCalendarPermissions,
  getProjectCalendarFeed,
} from '@/app/actions/calendar';
import { ModuleDisabledView } from '@/components/context/ModuleDisabledView';
import ContextCalendarClient from './ContextCalendarClient';

function getMonthRange(
  year: number,
  month: number
): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return {
    start: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    end: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  };
}

export default async function ContextCalendarPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const { projectId } = params;
  const [{ canView, reason }, permissions] = await Promise.all([
    getCanViewModule(projectId, 'calendar'),
    getCalendarPermissions(projectId),
  ]);
  if (!canView && reason) {
    return (
      <ModuleDisabledView
        moduleKey="calendar"
        projectId={projectId}
        reason={reason}
      />
    );
  }
  const now = new Date();
  const range = getMonthRange(now.getFullYear(), now.getMonth());
  const initialItems = await getProjectCalendarFeed({
    projectId,
    start: range.start,
    end: range.end,
  });
  return (
    <ContextCalendarClient
      projectId={projectId}
      initialItems={initialItems}
      start={range.start}
      end={range.end}
      permissions={permissions}
    />
  );
}

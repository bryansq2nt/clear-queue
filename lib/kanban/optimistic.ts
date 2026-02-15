import type { Database } from '@/lib/supabase/types';

type Task = Database['public']['Tables']['tasks']['Row'];

export function applyOptimisticTaskMove(
  tasks: Task[],
  taskId: string,
  newStatus: Task['status'],
  newOrderIndex: number
): Task[] {
  const moving = tasks.find((t) => t.id === taskId);
  if (!moving) return tasks;

  return tasks.map((t) => {
    if (t.id === taskId)
      return { ...t, status: newStatus, order_index: newOrderIndex };

    if (moving.status !== newStatus) {
      if (t.status === moving.status && t.order_index > moving.order_index) {
        return { ...t, order_index: t.order_index - 1 };
      }
      if (t.status === newStatus && t.order_index >= newOrderIndex) {
        return { ...t, order_index: t.order_index + 1 };
      }
      return t;
    }

    if (newOrderIndex > moving.order_index) {
      if (
        t.status === newStatus &&
        t.order_index > moving.order_index &&
        t.order_index <= newOrderIndex
      ) {
        return { ...t, order_index: t.order_index - 1 };
      }
      return t;
    }

    if (
      t.status === newStatus &&
      t.order_index >= newOrderIndex &&
      t.order_index < moving.order_index
    ) {
      return { ...t, order_index: t.order_index + 1 };
    }
    return t;
  });
}

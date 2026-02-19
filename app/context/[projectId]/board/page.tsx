import { Suspense } from 'react';
import { requireAuth } from '@/lib/auth';
import { SkeletonBoard } from '@/components/skeletons/SkeletonBoard';
import BoardContent from './BoardContent';

export default async function ContextBoardPage({
  params,
}: {
  params: { projectId: string };
}) {
  await requireAuth();
  const projectId = params.projectId;

  return (
    <Suspense fallback={<SkeletonBoard />}>
      <BoardContent projectId={projectId} />
    </Suspense>
  );
}

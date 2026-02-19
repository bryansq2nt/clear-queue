import { redirect } from 'next/navigation';

export default function ContextProjectPage({
  params,
}: {
  params: { projectId: string };
}) {
  redirect(`/context/${params.projectId}/board`);
}

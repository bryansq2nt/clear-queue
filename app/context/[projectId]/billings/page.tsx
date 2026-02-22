import ContextBillingsFromCache from './ContextBillingsFromCache';

interface ContextBillingsPageProps {
  params: { projectId: string };
}

export default function ContextBillingsPage({
  params,
}: ContextBillingsPageProps) {
  return <ContextBillingsFromCache projectId={params.projectId} />;
}

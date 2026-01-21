import { requireAuth } from '@/lib/auth'
import ProjectKanbanClient from '@/components/ProjectKanbanClient'
import LinkedIdeasSection from '@/components/LinkedIdeasSection'

export default async function ProjectPage({
  params,
}: {
  params: { id: string }
}) {
  await requireAuth()

  return (
    <>
      <ProjectKanbanClient projectId={params.id} />
      {/* 
        Linked Ideas Section - Server component ready to integrate
        Currently positioned as overlay. To integrate into RightPanel or main content,
        pass projectId prop to ProjectKanbanClient and render LinkedIdeasSection inside.
      */}
      <div className="fixed bottom-4 right-4 w-96 max-h-96 overflow-y-auto z-50 shadow-lg">
        <LinkedIdeasSection projectId={params.id} />
      </div>
    </>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { updateIdeaAction, deleteIdeaAction } from './actions'
import {
  linkIdeaToProjectAction,
  unlinkIdeaFromProjectAction,
} from './[id]/project-link-actions'
import { loadIdeaDataAction } from './load-idea-data'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Idea {
  id: string
  title: string
  description: string | null
}

interface Project {
  id: string
  name: string
}

interface ProjectLink {
  id: string
  project_id: string
  role: string | null
  created_at: string
  project?: Project
}

export default function IdeaDrawer({
  ideaId,
  isOpen,
  onClose,
  onUpdate,
}: {
  ideaId: string
  isOpen: boolean
  onClose: () => void
  onUpdate: () => void
}) {
  const router = useRouter()
  const [idea, setIdea] = useState<Idea | null>(null)
  const [projectLinks, setProjectLinks] = useState<ProjectLink[]>([])
  const [availableProjects, setAvailableProjects] = useState<
    { id: string; name: string }[]
  >([])
  const [isEditing, setIsEditing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Load idea data when drawer opens
  useEffect(() => {
    if (isOpen && ideaId) {
      loadIdeaData()
    }
  }, [isOpen, ideaId])

  const loadIdeaData = async () => {
    setLoading(true)
    try {
      const result = await loadIdeaDataAction(ideaId)
      if (result.error) {
        console.error('Failed to load idea:', result.error)
        return
      }
      if (!result.idea) {
        console.error('Idea not found')
        return
      }
      setIdea(result.idea)
      setProjectLinks(result.projectLinks ?? [])
      setAvailableProjects(result.availableProjects ?? [])
    } catch (error) {
      console.error('Failed to load idea data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdate(formData: FormData) {
    if (!idea) return

    formData.append('id', idea.id)
    const result = await updateIdeaAction(formData)

    if (result.data) {
      setIdea(result.data)
      setIsEditing(false)
      onUpdate()
    } else if (result.error) {
      alert(result.error)
    }
  }

  async function handleDelete() {
    if (!idea) return

    if (
      !confirm(
        'Are you sure you want to delete this idea? This action cannot be undone.'
      )
    ) {
      return
    }

    setIsDeleting(true)
    const result = await deleteIdeaAction(idea.id)

    if (result.success) {
      onClose()
      onUpdate()
      router.refresh()
    } else if (result.error) {
      alert(result.error)
      setIsDeleting(false)
    }
  }

  async function handleLinkProject(formData: FormData) {
    if (!idea) return

    setLinkError(null)
    const projectId = formData.get('projectId') as string
    const role = formData.get('role') as string | null

    if (!projectId) {
      setLinkError('Please select a project')
      return
    }

    const result = await linkIdeaToProjectAction(idea.id, projectId, role)

    if (result.data) {
      const form = document.getElementById('link-project-form') as HTMLFormElement
      form?.reset()
      loadIdeaData()
      onUpdate()
    } else if (result.error) {
      setLinkError(result.error)
    }
  }

  async function handleUnlink(linkId: string) {
    if (
      !confirm(
        'Are you sure you want to unlink this project? This action cannot be undone.'
      )
    ) {
      return
    }

    const result = await unlinkIdeaFromProjectAction(linkId)

    if (result.success) {
      loadIdeaData()
      onUpdate()
    } else if (result.error) {
      alert(result.error)
    }
  }

  if (!idea) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Idea Details</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center">Loading...</div>
        ) : (
          <div className="space-y-6">
            {/* Title and Description */}
            <div>
              {isEditing ? (
                <form action={handleUpdate} className="space-y-4">
                  <div>
                    <label
                      htmlFor="title"
                      className="block text-sm font-medium mb-2"
                    >
                      Title <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id="title"
                      name="title"
                      type="text"
                      required
                      defaultValue={idea.title}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="description"
                      className="block text-sm font-medium mb-2"
                    >
                      Description
                    </label>
                    <Textarea
                      id="description"
                      name="description"
                      rows={5}
                      defaultValue={idea.description || ''}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit">Save</Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsEditing(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <h2 className="text-2xl font-bold">{idea.title}</h2>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditing(true)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDelete}
                        disabled={isDeleting}
                      >
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                  {idea.description && (
                    <div className="prose max-w-none mb-4">
                      <p className="text-muted-foreground whitespace-pre-wrap">
                        {idea.description}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Linked Projects */}
            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-4">Linked Projects</h3>

              {/* Link to Project Form */}
              <div className="mb-4">
                <form
                  id="link-project-form"
                  action={handleLinkProject}
                  className="space-y-3"
                >
                  <div>
                    <label
                      htmlFor="projectId"
                      className="block text-sm font-medium mb-2"
                    >
                      Project <span className="text-red-500">*</span>
                    </label>
                    {availableProjects.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        All available projects are already linked to this idea.
                      </p>
                    ) : (
                      <select
                        id="projectId"
                        name="projectId"
                        required
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <option value="">Select a project...</option>
                        {availableProjects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label htmlFor="role" className="block text-sm font-medium mb-2">
                      Role (optional)
                    </label>
                    <Input
                      id="role"
                      name="role"
                      type="text"
                      placeholder="e.g., origin, reference, blocks"
                    />
                  </div>
                  {linkError && (
                    <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                      {linkError}
                    </div>
                  )}
                  <Button
                    type="submit"
                    size="sm"
                    disabled={availableProjects.length === 0}
                  >
                    Link Project
                  </Button>
                </form>
              </div>

              {/* Linked Projects List */}
              {projectLinks.length === 0 ? (
                <p className="text-muted-foreground">
                  This idea is not linked to any projects yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {projectLinks.map((link) => (
                    <div
                      key={link.id}
                      className="flex items-center justify-between p-3 bg-muted rounded-md"
                    >
                      <div className="flex-1">
                        {link.project ? (
                          <Link
                            href={`/project/${link.project.id}`}
                            className="font-medium hover:text-primary"
                            target="_blank"
                          >
                            {link.project.name}
                          </Link>
                        ) : (
                          <p className="font-medium">
                            Project ID: {link.project_id}
                          </p>
                        )}
                        {link.role && (
                          <p className="text-sm text-muted-foreground">
                            Role: {link.role}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUnlink(link.id)}
                      >
                        Unlink
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

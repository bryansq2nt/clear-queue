'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { updateIdeaAction, deleteIdeaAction } from '../actions'
import {
  linkIdeaToProjectAction,
  unlinkIdeaFromProjectAction,
} from './project-link-actions'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Idea {
  id: string
  title: string
  description: string | null
  created_at: string
  updated_at: string
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

export default function IdeaDetailClient({
  idea: initialIdea,
  projectLinks: initialProjectLinks,
  availableProjects,
}: {
  idea: Idea
  projectLinks: ProjectLink[]
  availableProjects: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [idea, setIdea] = useState(initialIdea)
  const [isDeleting, setIsDeleting] = useState(false)
  const [projectLinks, setProjectLinks] = useState(initialProjectLinks)
  const [linkError, setLinkError] = useState<string | null>(null)

  async function handleUpdate(formData: FormData) {
    formData.append('id', idea.id)
    const result = await updateIdeaAction(formData)

    if (result.data) {
      setIdea(result.data)
      setIsEditing(false)
      router.refresh()
    } else if (result.error) {
      alert(result.error)
    }
  }

  async function handleDelete() {
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
      router.push('/ideas')
    } else if (result.error) {
      alert(result.error)
      setIsDeleting(false)
    }
  }

  async function handleLinkProject(formData: FormData) {
    setLinkError(null)
    const projectId = formData.get('projectId') as string
    const role = formData.get('role') as string | null

    if (!projectId) {
      setLinkError('Please select a project')
      return
    }

    const result = await linkIdeaToProjectAction(idea.id, projectId, role)

    if (result.data) {
      // Reset form
      const form = document.getElementById('link-project-form') as HTMLFormElement
      form?.reset()
      router.refresh()
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
      router.refresh()
    } else if (result.error) {
      alert(result.error)
    }
  }

  // Filter out projects that are already linked
  const linkedProjectIds = new Set(projectLinks.map((link) => link.project_id))
  const availableProjectsToLink = availableProjects.filter(
    (p) => !linkedProjectIds.has(p.id)
  )

  return (
    <div className="space-y-6">
      {/* Title and Description */}
      <div className="bg-white rounded-lg border p-6">
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
              <h1 className="text-3xl font-bold">{idea.title}</h1>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                >
                  Edit
                </Button>
                <Button
                  variant="destructive"
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
            <div className="text-sm text-muted-foreground">
              <p>
                Created: {new Date(idea.created_at).toLocaleString()}
              </p>
              {idea.updated_at !== idea.created_at && (
                <p>
                  Updated: {new Date(idea.updated_at).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Linked Projects */}
      <div className="bg-white rounded-lg border p-6 space-y-6">
        <h2 className="text-xl font-semibold">Linked Projects</h2>

        {/* Link to Project Form */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium mb-3">Link to Project</h3>
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
              {availableProjectsToLink.length === 0 ? (
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
                  {availableProjectsToLink.map((project) => (
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
              disabled={availableProjectsToLink.length === 0}
            >
              Link Project
            </Button>
          </form>
        </div>

        {/* Linked Projects List */}
        {projectLinks.length === 0 ? (
          <div className="border-t pt-4">
            <p className="text-muted-foreground">
              This idea is not linked to any projects yet.
            </p>
          </div>
        ) : (
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium mb-3">Linked Projects</h3>
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
                      >
                        {link.project.name}
                      </Link>
                    ) : (
                      <p className="font-medium">Project ID: {link.project_id}</p>
                    )}
                    {link.role && (
                      <p className="text-sm text-muted-foreground">
                        Role: {link.role}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-muted-foreground">
                      {new Date(link.created_at).toLocaleDateString()}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnlink(link.id)}
                    >
                      Unlink
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

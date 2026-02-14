import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'
import { Database } from '@/lib/supabase/types'

type IdeaProjectLink = Database['public']['Tables']['idea_project_links']['Row']
type IdeaProjectLinkInsert = Database['public']['Tables']['idea_project_links']['Insert']

/**
 * Helper to get the current user ID or throw an error
 */
async function getUserIdOrThrow(): Promise<string> {
  const user = await getUser()
  if (!user || !user.id) {
    throw new Error('User must be authenticated')
  }
  return user.id
}

/**
 * Link an idea to a project
 */
export async function linkIdeaToProject(input: {
  ideaId: string
  projectId: string
  role?: string | null
}): Promise<IdeaProjectLink> {
  if (!input.ideaId || input.ideaId.trim().length === 0) {
    throw new Error('Idea ID is required')
  }

  if (!input.projectId || input.projectId.trim().length === 0) {
    throw new Error('Project ID is required')
  }

  const ownerId = await getUserIdOrThrow()
  const supabase = await createClient()

  const insertData: IdeaProjectLinkInsert = {
    owner_id: ownerId,
    idea_id: input.ideaId,
    project_id: input.projectId,
    role: input.role?.trim() || null,
  }

  const { data, error } = await supabase
    .from('idea_project_links')
    // @ts-ignore - Supabase type inference issue with generated types
    .insert(insertData)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to link idea to project: ${error.message}`)
  }

  if (!data) {
    throw new Error('Failed to link idea to project: No data returned')
  }

  return data
}

/**
 * List all project links for a specific idea
 */
export async function listProjectLinksForIdea(
  ideaId: string
): Promise<IdeaProjectLink[]> {
  if (!ideaId || ideaId.trim().length === 0) {
    throw new Error('Idea ID is required')
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('idea_project_links')
    .select('*')
    .eq('idea_id', ideaId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to list project links for idea: ${error.message}`)
  }

  return data || []
}

/**
 * List all project links for a specific project
 */
export async function listProjectLinksForProject(
  projectId: string
): Promise<IdeaProjectLink[]> {
  if (!projectId || projectId.trim().length === 0) {
    throw new Error('Project ID is required')
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('idea_project_links')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(
      `Failed to list project links for project: ${error.message}`
    )
  }

  return data || []
}

/**
 * List all idea-project links for multiple projects
 */
export async function listProjectLinksForProjectIds(
  projectIds: string[]
): Promise<IdeaProjectLink[]> {
  if (!projectIds || projectIds.length === 0) {
    return []
  }
  const validIds = projectIds.filter((id) => id && id.trim().length > 0)
  if (validIds.length === 0) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('idea_project_links')
    .select('*')
    .in('project_id', validIds)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(
      `Failed to list project links for projects: ${error.message}`
    )
  }
  return data || []
}

/**
 * Unlink an idea from a project
 */
export async function unlinkIdeaFromProject(linkId: string): Promise<void> {
  if (!linkId || linkId.trim().length === 0) {
    throw new Error('Link ID is required')
  }

  const supabase = await createClient()

  const { error } = await supabase
    .from('idea_project_links')
    .delete()
    .eq('id', linkId)

  if (error) {
    throw new Error(`Failed to unlink idea from project: ${error.message}`)
  }
}

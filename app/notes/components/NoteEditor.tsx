'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  createNote,
  updateNote,
  deleteNote,
  addNoteLink,
  deleteNoteLink,
} from '@/app/notes/actions'
import { getProjects } from '@/app/budgets/actions'
import { ArrowLeft, Link2, Plus, Trash2, Check } from 'lucide-react'
import { Database } from '@/lib/supabase/types'

type NoteLink = Database['public']['Tables']['note_links']['Row']

export type LocalLink = { id: string; title?: string; url: string }

const AUTOSAVE_DELAY_MS = 1500
const MIN_VALID_URL = (url: string) => {
  const u = url.trim()
  return u.length > 0 && (u.startsWith('http://') || u.startsWith('https://'))
}

export interface NoteEditorProps {
  mode: 'create' | 'edit'
  noteId?: string
  initialNote: { title: string; content: string; project_id: string }
  initialLinks: NoteLink[] | LocalLink[]
  preselectedProjectId?: string | null
}

export function NoteEditor({
  mode,
  noteId,
  initialNote,
  initialLinks,
  preselectedProjectId,
}: NoteEditorProps) {
  const router = useRouter()
  const [title, setTitle] = useState(initialNote.title)
  const [content, setContent] = useState(initialNote.content)
  const [projectId, setProjectId] = useState(initialNote.project_id || preselectedProjectId || '')
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [links, setLinks] = useState<(NoteLink | LocalLink)[]>(initialLinks)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [showAddLink, setShowAddLink] = useState(false)
  const [newLinkTitle, setNewLinkTitle] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const lastSavedRef = useRef<{ title: string; content: string; project_id: string }>(initialNote)
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isEdit = mode === 'edit'

  const loadProjects = useCallback(async () => {
    const list = await getProjects()
    setProjects(list)
    if (preselectedProjectId && list.some((p) => p.id === preselectedProjectId)) {
      setProjectId((prev) => prev || preselectedProjectId!)
    }
  }, [preselectedProjectId])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    setTitle(initialNote.title)
    setContent(initialNote.content)
    setProjectId(initialNote.project_id || preselectedProjectId || '')
    setLinks(initialLinks)
    lastSavedRef.current = initialNote
  }, [initialNote, initialLinks, preselectedProjectId])

  const hasChanges = useCallback(() => {
    const t = title.trim()
    const c = content
    const p = projectId
    const last = lastSavedRef.current
    return t !== last.title || c !== last.content || p !== last.project_id
  }, [title, content, projectId])

  const performSave = useCallback(async () => {
    if (!isEdit || !noteId) return
    setError(null)
    setSaveStatus('saving')
    const result = await updateNote(noteId, {
      title: title.trim(),
      content,
      project_id: projectId,
    })
    setSaving(false)
    setSaveStatus(result.error ? 'idle' : 'saved')
    if (result.error) {
      setError(result.error)
      return
    }
    lastSavedRef.current = { title: title.trim(), content, project_id: projectId }
    router.refresh()
    setTimeout(() => setSaveStatus('idle'), 2000)
  }, [isEdit, noteId, title, content, projectId, router])

  useEffect(() => {
    if (!isEdit || !noteId) return
    if (!hasChanges()) return
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = setTimeout(() => {
      performSave()
      autosaveTimerRef.current = null
    }, AUTOSAVE_DELAY_MS)
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current)
    }
  }, [title, content, projectId, isEdit, noteId, hasChanges, performSave])

  const handleSaveClick = async () => {
    if (isEdit) {
      await performSave()
      return
    }
    setError(null)
    setSaving(true)
    if (!projectId) {
      setError('Select a project.')
      setSaving(false)
      return
    }
    const t = title.trim()
    if (!t) {
      setError('Title is required.')
      setSaving(false)
      return
    }
    const result = await createNote({
      project_id: projectId,
      title: t,
      content: content ?? '',
    })
    if (result.error) {
      setError(result.error)
      setSaving(false)
      return
    }
    const newId = result.data!.id
    for (const link of links as LocalLink[]) {
      const url = link.url.trim()
      if (!url || !MIN_VALID_URL(url)) continue
      await addNoteLink(newId, { title: link.title?.trim() || null, url })
    }
    setSaving(false)
    router.push(`/notes/${newId}`)
  }

  const handleDelete = async () => {
    if (!isEdit || !noteId) return
    if (!confirm('Delete this note? This cannot be undone.')) return
    const { error: err } = await deleteNote(noteId)
    if (err) alert(err)
    else router.push('/notes')
  }

  const addLink = (e: React.FormEvent) => {
    e.preventDefault()
    const url = newLinkUrl.trim()
    if (!url) return
    if (!MIN_VALID_URL(url)) {
      setError('URL must start with http:// or https://')
      return
    }
    setError(null)
    if (isEdit && noteId) {
      addNoteLink(noteId, { title: newLinkTitle.trim() || null, url }).then((res) => {
        if (res.data) setLinks((prev) => [...prev, res.data!])
        if (res.error) setError(res.error)
        else router.refresh()
      })
    } else {
      setLinks((prev) => [...prev, { id: `local-${Date.now()}`, title: newLinkTitle.trim() || undefined, url }])
    }
    setNewLinkTitle('')
    setNewLinkUrl('')
    setShowAddLink(false)
  }

  const removeLink = (link: NoteLink | LocalLink) => {
    if ('note_id' in link && link.note_id) {
      deleteNoteLink(link.id).then(() => setLinks((prev) => prev.filter((l) => l.id !== link.id)))
      router.refresh()
    } else {
      setLinks((prev) => prev.filter((l) => l.id !== link.id))
    }
  }

  const linkHref = (url: string) => (url.startsWith('http') ? url : `https://${url}`)
  const linkLabel = (link: NoteLink | LocalLink) => (link.title && link.title.trim() ? link.title.trim() : link.url)

  return (
    <div className="max-w-6xl mx-auto w-full">
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-10 bg-slate-50/95 dark:bg-gray-900/95 backdrop-blur border-b border-slate-200 dark:border-gray-700 -mx-4 px-4 py-3 flex flex-wrap items-center gap-3">
        <Link
          href="/notes"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Notes
        </Link>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-[180px] h-9 border-slate-200 dark:border-gray-600" id="note-editor-project">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={handleSaveClick} disabled={saving} className="ml-auto">
          {saving ? 'Saving...' : isEdit ? 'Save' : 'Create Note'}
        </Button>
        {isEdit && saveStatus === 'saved' && (
          <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <Check className="w-3.5 h-3.5" />
            Saved
          </span>
        )}
        {isEdit && noteId && (
          <Button size="sm" variant="outline" onClick={handleDelete} className="text-red-600 hover:text-red-700 border-red-200 dark:border-red-800">
            Delete
          </Button>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 lg:gap-10 pt-6">
        {/* Main: title + content */}
        <div className="min-w-0">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full text-2xl lg:text-3xl font-semibold bg-transparent border-0 border-b border-transparent focus:border-slate-300 dark:focus:border-gray-600 focus:outline-none focus:ring-0 pb-2 text-gray-900 dark:text-white placeholder:text-slate-400"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your note..."
            className="mt-6 w-full min-h-[60vh] resize-y bg-transparent border-0 focus:outline-none focus:ring-0 text-base leading-relaxed text-gray-900 dark:text-white placeholder:text-slate-400 py-0"
            style={{ minHeight: '60vh' }}
          />
        </div>

        {/* Right: Links y referencias (sidebar on desktop, collapsible on mobile) */}
        <div className="lg:pl-4 lg:border-l border-slate-200 dark:border-gray-700">
          <div className="lg:sticky lg:top-[4.5rem]">
            <details className="group lg:block" open>
              <summary className="lg:list-none lg:pointer-events-none cursor-pointer list-none flex items-center gap-2 mb-4 text-sm font-semibold text-slate-700 dark:text-slate-300 [&::-webkit-details-marker]:hidden">
                <Link2 className="w-4 h-4 flex-shrink-0" />
                Links y referencias
                <span className="lg:hidden ml-1 opacity-70 group-open:rotate-180">▼</span>
              </summary>
            {showAddLink ? (
              <form onSubmit={addLink} className="space-y-2 p-3 rounded-lg bg-slate-100 dark:bg-gray-800 mb-4">
                <Input
                  value={newLinkTitle}
                  onChange={(e) => setNewLinkTitle(e.target.value)}
                  placeholder="Label (optional)"
                  className="text-sm"
                />
                <Input
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  placeholder="https://..."
                  type="url"
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm">Add</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setShowAddLink(false); setNewLinkTitle(''); setNewLinkUrl(''); }}>Cancel</Button>
                </div>
              </form>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowAddLink(true)} className="mb-4">
                <Plus className="w-4 h-4 mr-1" />
                Add link
              </Button>
            )}
            {links.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No links yet.</p>
            ) : (
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.id} className="flex items-center gap-2 group">
                    <a
                      href={linkHref(link.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-0 truncate text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {linkLabel(link)}
                    </a>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-700 h-8 w-8 p-0 flex-shrink-0"
                      onClick={() => removeLink(link)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}

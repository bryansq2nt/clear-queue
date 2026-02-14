'use client'

import Link from 'next/link'
import { useI18n } from '@/components/I18nProvider'
import { MoreVertical, Edit, Trash2, Phone, Mail, Copy, Send } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { deleteClientAction } from '../actions'
import { Database } from '@/lib/supabase/types'

type Client = Database['public']['Tables']['clients']['Row']

function EmailAction({ email }: { email: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="flex items-center gap-1.5 mt-0.5 text-sm text-gray-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white w-full text-left min-w-0"
        >
          <Mail className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{email}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation()
            void navigator.clipboard.writeText(email)
          }}
        >
          <Copy className="w-4 h-4 mr-2" />
          Copy email
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`mailto:${email}`} onClick={(e) => e.stopPropagation()}>
            <Send className="w-4 h-4 mr-2" />
            Send email
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface ClientCardProps {
  client: Client
  onDeleted?: () => void
  onEdit?: (client: Client) => void
}

export function ClientCard({ client, onDeleted, onEdit }: ClientCardProps) {
  const { t } = useI18n()
  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`Delete "${client.full_name}"? This will also remove their businesses and unlink from projects.`)) {
      return
    }
    const { error } = await deleteClientAction(client.id)
    if (error) {
      alert(error)
      return
    }
    onDeleted?.()
  }

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border p-5 hover:shadow-md transition-all relative group">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/clients/${client.id}`} className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
            {client.full_name}
          </h3>
          {client.phone && (
            <a
              href={`tel:${client.phone.replace(/\s/g, '')}`}
              className="flex items-center gap-1.5 mt-1 text-sm text-gray-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <Phone className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{client.phone}</span>
            </a>
          )}
          {client.email && (
            <EmailAction email={client.email} />
          )}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
            <button
              className="p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
              onClick={(e) => e.preventDefault()}
            >
              <MoreVertical className="w-4 h-4 text-gray-500" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit && (
              <DropdownMenuItem onClick={() => onEdit(client)}>
                <Edit className="w-4 h-4 mr-2" />
                {t('common.edit')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

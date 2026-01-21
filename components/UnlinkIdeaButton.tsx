'use client'

import { useRouter } from 'next/navigation'
import { Button } from './ui/button'
import { unlinkIdeaFromProjectAction } from '@/app/ideas/[id]/project-link-actions'

export default function UnlinkButton({ linkId }: { linkId: string }) {
  const router = useRouter()

  async function handleUnlink() {
    if (
      !confirm(
        'Are you sure you want to unlink this idea? This action cannot be undone.'
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

  return (
    <Button variant="outline" size="sm" onClick={handleUnlink}>
      Unlink
    </Button>
  )
}

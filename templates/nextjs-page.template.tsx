/**
 * Next.js Page Template
 *
 * Use this template when creating new pages.
 * Follow the Server Component + Client Component pattern.
 *
 * Usage:
 * 1. Copy the PAGE section to app/[feature]/page.tsx
 * 2. Copy the ACTIONS section to app/[feature]/actions.ts
 * 3. Copy the CLIENT section to app/[feature]/FeatureClient.tsx
 * 4. Rename types and components for your feature
 *
 * See: docs/patterns/data-loading.md
 */

// =============================================================================
// SECTION 1 — COPY TO app/[feature]/page.tsx
// =============================================================================
/*
import FeatureClient from './FeatureClient'
import { getFeatureData } from './actions'

export default async function FeaturePage() {
  const features = await getFeatureData()
  return (
    <div>
      <h1>Features</h1>
      <FeatureClient initialFeatures={features} />
    </div>
  )
}
*/

// =============================================================================
// SECTION 2 — COPY TO app/[feature]/actions.ts
// =============================================================================
/*
'use server'

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

// ✅ Wrap read actions with cache()
export const getFeatureData = cache(async () => {
  const supabase = await createClient()
  const user = await requireAuth()

  const { data, error } = await supabase
    .from('features')
    .select('id, name, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data
})

// ❌ Don't cache mutations
export async function createFeature(formData: FormData) {
  const supabase = await createClient()
  const user = await requireAuth()
  // ... mutation logic
  revalidatePath('/features')
}
*/

// =============================================================================
// SECTION 3 — COPY TO app/[feature]/FeatureClient.tsx
// =============================================================================
/*
'use client'

import { useState } from 'react'

type Feature = { id: string; name: string; status: string; created_at: string }

interface Props {
  initialFeatures: Feature[]
}

export default function FeatureClient({ initialFeatures }: Props) {
  const [features, setFeatures] = useState(initialFeatures)

  const handleCreate = async (name: string) => {
    const formData = new FormData()
    formData.set('name', name)
    await createFeature(formData)
    // Use router.refresh() or optimistic update
  }

  return (
    <div>
      {features.map((feature) => (
        <div key={feature.id}>{feature.name}</div>
      ))}
      <button type="button" onClick={() => handleCreate('New Feature')}>
        Add Feature
      </button>
    </div>
  )
}
*/

// =============================================================================
// CHECKLIST
// =============================================================================
/*
 * Before committing, verify:
 *
 * Page (Server Component):
 * - [ ] Is async function
 * - [ ] Fetches data with await
 * - [ ] Passes data to client as props
 * - [ ] NO 'use client' directive
 *
 * Actions:
 * - [ ] Read actions wrapped with cache()
 * - [ ] Mutations NOT wrapped with cache()
 * - [ ] All actions have 'use server'
 * - [ ] Mutations call revalidatePath()
 *
 * Client Component:
 * - [ ] Has 'use client' directive
 * - [ ] Receives data as props
 * - [ ] Initializes state from props
 * - [ ] NO useEffect for initial data fetch
 * - [ ] Only mutation handlers present
 *
 * Performance:
 * - [ ] Tested: < 5 POST requests on page load
 * - [ ] Tested: < 1 second load time
 * - [ ] Tested: No loading spinner for initial data
 */

// Keep file as valid module (template is reference-only; copy sections to real files)
export {}

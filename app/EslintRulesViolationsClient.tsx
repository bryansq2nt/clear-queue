/**
 * Example file that deliberately violates all three custom ESLint rules.
 * Used to verify the rules run and report correctly. Do not fix these on purpose.
 *
 * Run: npx eslint app/EslintRulesViolationsClient.tsx
 */

'use client';

// --- Rule 1: no-client-supabase-in-components ---
// Violation: createClient() in a 'use client' file under app/**/*Client.tsx
import { createClient } from '@/lib/supabase/client';

// --- Rule 2: no-select-star ---
// Violation: .select('*') in Supabase queries
async function fetchWithSelectStar() {
  const supabase = createClient();
  const { data } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: true });
  return data;
}

// --- Rule 3: no-manual-refetch-after-action ---
// Violation: await someAction() followed by await loadSomething() in the same function
async function handleSave() {
  await createProjectAction(new FormData());
  await loadProjects();
}

async function createProjectAction(_formData: FormData) {
  return { data: null, error: null };
}

function loadProjects() {
  return Promise.resolve();
}

export default function ViolationsExample() {
  return <div>See ESLint output when run on this file.</div>;
}

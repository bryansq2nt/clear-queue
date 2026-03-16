// Context-only module — no proposal types.
// Documents are read-only; the Copilot can reference them but cannot create or upload.

// ─── Context fetcher ──────────────────────────────────────────────────────────

/**
 * @param ownerFilter  null = project scope (no owner filter);
 *                     string[] = restrict to these owner IDs (own or team scope).
 *                     Resolved by buildProjectContext before this call.
 */
export async function fetchDocumentsContext(
  projectId: string,
  scope: 'standard' | 'full',
  supabase: any,
  ownerFilter: string[] | null
): Promise<string> {
  let query = supabase
    .from('project_files')
    .select('title, document_category, file_ext')
    .eq('project_id', projectId)
    .eq('kind', 'document')
    .is('archived_at', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (ownerFilter !== null) {
    query =
      ownerFilter.length === 1
        ? query.eq('owner_id', ownerFilter[0])
        : query.in('owner_id', ownerFilter);
  }

  const { data } = await query;

  const docs = (data ?? []) as {
    title: string;
    document_category: string | null;
    file_ext: string | null;
  }[];

  if (docs.length === 0) return '## Documents\n- No documents uploaded yet.';

  if (scope === 'full') {
    const lines = docs.map((d) => {
      const parts = [d.title];
      if (d.document_category) parts.push(d.document_category);
      if (d.file_ext) parts.push(d.file_ext);
      return `- ${parts.join(' · ')}`;
    });
    return `## Documents (${docs.length} total)\n${lines.join('\n')}`;
  }

  // Standard: count + categories present + first 5 titles
  const categories = [
    ...new Set(
      docs.map((d) => d.document_category).filter((c): c is string => !!c)
    ),
  ];
  const recentTitles = docs.slice(0, 5).map((d) => d.title);
  const parts: string[] = [
    `${docs.length} document${docs.length !== 1 ? 's' : ''}`,
  ];
  if (categories.length > 0) parts.push(`Categories: ${categories.join(', ')}`);
  parts.push(`Recent: ${recentTitles.join(', ')}`);
  return `## Documents\n${parts.join('. ')}.`;
}

// Project categories constant
export const PROJECT_CATEGORIES = [
    { key: 'business', label: 'Business' },
    { key: 'clients', label: 'Clients' },
    { key: 'development', label: 'Development' },
    { key: 'internal_tools', label: 'Internal Tools' },
    { key: 'operations', label: 'Operations' },
    { key: 'personal', label: 'Personal' },
    { key: 'research', label: 'Research' },
    { key: 'archived', label: 'Archived' },
] as const

export type ProjectCategory = typeof PROJECT_CATEGORIES[number]['key']

// Helper function to get category label
export function getCategoryLabel(key: string): string {
    const category = PROJECT_CATEGORIES.find(c => c.key === key)
    return category?.label || key
}

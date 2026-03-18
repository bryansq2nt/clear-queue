/**
 * Shown by Next.js while app/context/[projectId]/layout.tsx is awaiting its
 * server-side data (project, modules, access grant, canToggle).  Mirrors the
 * ContextShell structure — header + tab bar + content area — so the screen
 * never goes blank between navigation and the real layout rendering.
 */
export default function ContextLoading() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-background">
      <div className="flex h-full w-full flex-col bg-background">
        {/* Header skeleton — matches ContextShell header */}
        <header className="bg-primary flex-shrink-0 shadow">
          <div className="px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
            <div className="h-9 w-24 rounded-md bg-primary-foreground/20 animate-pulse" />
            <div className="h-5 w-32 rounded bg-primary-foreground/20 animate-pulse" />
            <div className="h-9 w-16 rounded-md bg-primary-foreground/20 animate-pulse" />
          </div>
        </header>

        {/* Tab bar skeleton */}
        <div className="flex-shrink-0 border-b border-border bg-background px-2 py-2">
          <div className="flex gap-2 overflow-x-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-8 w-20 flex-shrink-0 rounded-full bg-muted animate-pulse"
              />
            ))}
          </div>
        </div>

        {/* Content area skeleton */}
        <main className="relative flex-1 overflow-auto min-h-0 p-4 sm:p-6">
          <div className="space-y-4 max-w-4xl">
            <div className="h-8 w-48 rounded bg-muted animate-pulse" />
            <div className="h-4 w-full rounded bg-muted animate-pulse" />
            <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
            <div className="mt-6 h-32 w-full rounded-lg bg-muted animate-pulse" />
            <div className="h-24 w-full rounded-lg bg-muted animate-pulse" />
            <div className="h-24 w-full rounded-lg bg-muted animate-pulse" />
          </div>
        </main>
      </div>
    </div>
  );
}

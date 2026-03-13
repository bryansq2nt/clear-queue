export function SkeletonTeam() {
  return (
    <div className="p-4 md:p-6 max-w-2xl animate-pulse space-y-6">
      <div className="h-6 bg-muted rounded w-32" />
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border">
            <div className="w-9 h-9 rounded-full bg-muted shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 bg-muted rounded w-40" />
              <div className="h-3 bg-muted rounded w-28" />
            </div>
            <div className="h-5 bg-muted rounded w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

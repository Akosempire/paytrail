// Shown the instant you open a dashboard page, while its data loads.
// data-page-loading lets the end-to-end tests see it.
const bar = "animate-pulse rounded-md bg-hover";

export function PageSkeleton({ rows = 6, stats = true }) {
  return (
    <div data-page-loading className="flex flex-col gap-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="flex flex-col gap-2">
        <div className={`${bar} h-8 w-56`} />
        <div className={`${bar} h-4 w-80 max-w-full`} />
      </div>
      {stats && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-[104px] rounded-xl bg-surface p-5 ring-1 ring-line"><div className={`${bar} h-3 w-24`} /><div className={`${bar} mt-4 h-7 w-32`} /></div>)}
        </div>
      )}
      <div className="rounded-xl bg-surface ring-1 ring-line">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0">
            <div className={`${bar} size-9 rounded-full`} />
            <div className="flex-1 space-y-2"><div className={`${bar} h-3.5 w-1/3`} /><div className={`${bar} h-3 w-1/4`} /></div>
            <div className={`${bar} h-4 w-20`} />
          </div>
        ))}
      </div>
    </div>
  );
}

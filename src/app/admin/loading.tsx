/**
 * Shown instantly during admin nav while the server renders the new page.
 * Replaces the 1-3s blank screen with a branded skeleton.
 */
export default function AdminLoading() {
  return (
    <>
      <div className="h-16 bg-white/85 border-b border-line sticky top-0 z-20">
        <div className="h-full px-6 lg:px-8 flex items-center gap-4">
          <div className="flex-1 max-w-md space-y-2">
            <div className="h-4 w-32 skeleton rounded" />
            <div className="h-3 w-48 skeleton rounded" />
          </div>
        </div>
      </div>

      <div className="px-6 lg:px-10 py-6 lg:py-8 animate-pulse">
        <div className="flex items-end gap-4 mb-6">
          <div className="flex-1 space-y-2.5">
            <div className="h-7 w-64 skeleton rounded" />
            <div className="h-4 w-80 skeleton rounded" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="surface-card p-5 space-y-3">
              <div className="h-3 w-20 skeleton rounded" />
              <div className="h-8 w-28 skeleton rounded" />
              <div className="h-3 w-16 skeleton rounded" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 surface-card p-5 space-y-4">
            <div className="h-5 w-40 skeleton rounded" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-12 skeleton rounded-card-sm" />
            ))}
          </div>
          <div className="surface-card p-5 space-y-4">
            <div className="h-5 w-32 skeleton rounded" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 skeleton rounded-card-sm" />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

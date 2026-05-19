export default function OrgAdminLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-48 skeleton rounded" />
        <div className="h-4 w-64 skeleton rounded" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="surface-card p-4 space-y-2">
            <div className="h-3 w-16 skeleton rounded" />
            <div className="h-7 w-20 skeleton rounded" />
          </div>
        ))}
      </div>
      <div className="surface-card p-5 space-y-3">
        <div className="h-5 w-40 skeleton rounded" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-12 skeleton rounded-card-sm" />
        ))}
      </div>
    </div>
  );
}

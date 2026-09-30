// Shared blocking-loading indicator: a centered spinner popup over the
// current screen. Used for "real" loads (page/section fetches, sends) —
// never for optimistic row actions (star/archive/trash/...), which stay
// instant with no popup on purpose.
export default function LoadingOverlay({ message }: { message: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-body/20">
      <div className="rounded-2xl bg-surface border border-line shadow-xl px-6 py-5 flex flex-col items-center gap-3">
        <div className="h-6 w-6 rounded-full border-2 border-line border-t-ink animate-spin" />
        <p className="text-sm text-body">{message}</p>
      </div>
    </div>
  );
}

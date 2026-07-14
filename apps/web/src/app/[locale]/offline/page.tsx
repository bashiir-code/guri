// Offline fallback (SPEC §11 PWA). The service worker serves this document for
// ANY navigation that fails while offline, regardless of the visitor's locale —
// so both languages are shown side by side instead of using next-intl.
// Static and dependency-light on purpose: it must render from the precache.
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-mist px-6 text-center">
      <div className="text-6xl" aria-hidden>
        📡
      </div>
      <div className="space-y-2">
        <h1 className="font-display text-2xl font-bold text-forest">
          Waad ka maqan tahay internetka
        </h1>
        <p className="text-slate">Bogga lama soo rari karo ilaa xiriirku soo noqdo.</p>
      </div>
      <div className="space-y-2">
        <h2 className="font-display text-2xl font-bold text-forest">You&rsquo;re offline</h2>
        <p className="text-slate">This page can&rsquo;t load until your connection comes back.</p>
      </div>
      <a
        href="/"
        className="rounded-full bg-lime px-6 py-3 text-sm font-semibold text-forest"
      >
        Isku day mar kale · Try again
      </a>
    </main>
  );
}

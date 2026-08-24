import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton generik dipakai di loading.tsx tiap route dashboard - supaya
 * navigasi antar menu sidebar langsung dapat feedback visual instan
 * (Next.js streaming) alih-alih layar kosong/beku sampai data selesai.
 */
export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-lg" />
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ContactsPagination({
  page,
  pageSize,
  totalCount,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  function hrefFor(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    return `${pathname}?${params.toString()}`;
  }

  if (totalCount === 0) return null;

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        Menampilkan {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} dari{" "}
        {totalCount} kontak
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          nativeButton={false}
          render={
            <Link href={hrefFor(Math.max(1, page - 1))}>
              <ChevronLeft className="h-3.5 w-3.5" /> Sebelumnya
            </Link>
          }
        />
        <span className="flex items-center px-2">
          Halaman {page} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= totalPages}
          nativeButton={false}
          render={
            <Link href={hrefFor(Math.min(totalPages, page + 1))}>
              Berikutnya <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          }
        />
      </div>
    </div>
  );
}

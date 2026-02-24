"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Loader2 } from "lucide-react";

interface Props {
  sermonId: Id<"sermons">;
  summaryText: string;
}

export default function SimilarSermons({ sermonId, summaryText }: Props) {
  const findSimilar = useAction(api.similar.findSimilar);
  const [results, setResults] = useState<
    { originalSermonId: number; title: string; summary: string | null; tags: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    findSimilar({ sermonId, summaryText })
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sermonId, summaryText, findSimilar]);

  if (error || (!loading && results.length === 0)) return null;

  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
      <div className="px-4 py-3 sm:px-5">
        <p className="text-[12px] font-semibold text-muted-foreground">비슷한 설교</p>
      </div>
      <div className="border-t border-border">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-4 animate-spin text-subtle" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {results.map((r) => {
              const tags = r.tags ? r.tags.split(",").map((t) => t.trim()) : [];
              return (
                <Link
                  key={r.originalSermonId}
                  href={`/sermons/${r.originalSermonId}`}
                  className="block px-4 py-3 transition-colors hover:bg-muted sm:px-5"
                >
                  <p className="text-sm font-medium text-foreground">{r.title}</p>
                  {r.summary && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {r.summary}
                    </p>
                  )}
                  {tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {tags.map((tag, i) => (
                        <span
                          key={i}
                          className="rounded bg-muted px-1.5 py-px text-[11px] font-medium text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";

export function AnalyticsFilters({ repos, authors }: { repos: { id: string; name: string }[]; authors: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string, fallback: string) => {
    const p = new URLSearchParams(sp);
    if (v === fallback) p.delete(k);
    else p.set(k, v);
    router.push(`${pathname}${p.size ? `?${p}` : ""}`);
  };
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filters">
      <Select aria-label="Period" className="w-full sm:w-40" value={sp.get("days") ?? "30"} onValueChange={(v) => set("days", v, "30")}
        options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]} />
      <Select aria-label="Repository" className="w-full sm:w-56" value={sp.get("repo") ?? "all"} onValueChange={(v) => set("repo", v, "all")}
        options={[{ value: "all", label: "All repositories" }, ...repos.map((r) => ({ value: r.id, label: r.name }))]} />
      <Select aria-label="Author" className="w-full sm:w-44" value={sp.get("author") ?? "all"} onValueChange={(v) => set("author", v, "all")}
        options={[{ value: "all", label: "All authors" }, ...authors.map((a) => ({ value: a, label: a }))]} />
    </div>
  );
}

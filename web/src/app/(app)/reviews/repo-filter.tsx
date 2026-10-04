"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";

export function RepoFilter({ repos, value }: { repos: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <Select
      aria-label="Filter by repository"
      className="w-full sm:w-56"
      value={value || "all"}
      onValueChange={(v) => {
        const p = new URLSearchParams(sp);
        if (v === "all") p.delete("repo");
        else p.set("repo", v);
        p.delete("after");
        router.push(`${pathname}${p.size ? `?${p}` : ""}`);
      }}
      options={[{ value: "all", label: "All repositories" }, ...repos.map((r) => ({ value: r.id, label: r.name }))]}
    />
  );
}

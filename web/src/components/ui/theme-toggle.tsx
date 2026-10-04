"use client";
import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useStored, writeStored } from "@/lib/use-stored";
import { Button } from "./button";
import { Tooltip } from "./tooltip";

type Theme = "system" | "light" | "dark";
const next: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const icon = { system: Monitor, light: Sun, dark: Moon };


export function ThemeToggle() {
  const stored = useStored("theme");
  const theme: Theme = stored === "light" || stored === "dark" ? stored : "system";

  function cycle() {
    const t = next[theme];
    const root = document.documentElement;
    if (t === "system") delete root.dataset.theme;
    else root.dataset.theme = t;
    writeStored("theme", t === "system" ? null : t);
  }

  const Icon = icon[theme];
  const label = `Theme: ${theme}. Switch to ${next[theme]}`;
  return (
    <Tooltip content={label}>
      <Button variant="ghost" size="icon" onClick={cycle} aria-label={label}>
        <Icon aria-hidden />
      </Button>
    </Tooltip>
  );
}

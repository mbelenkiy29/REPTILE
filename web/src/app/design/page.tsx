import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Showcase } from "./showcase";

export const metadata: Metadata = { title: "Design system", robots: { index: false } };

export default async function DesignPage() {
  await connection(); // decide at request time, so SHOW_DESIGN works without a rebuild
  if (process.env.NODE_ENV === "production" && process.env.SHOW_DESIGN !== "1") notFound();
  return <Showcase />;
}

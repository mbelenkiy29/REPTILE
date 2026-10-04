import type { Metadata } from "next";
import { NewOrgForm } from "./form";

export const metadata: Metadata = { title: "New organization" };

export default function NewOrgPage() {
  return (
    <div className="max-w-[440px]">
      <h1 className="text-xl text-fg">Create an organization</h1>
      <p className="mt-1 text-muted">An organization holds your repositories, settings, members and billing. You get 14 days free.</p>
      <NewOrgForm />
    </div>
  );
}

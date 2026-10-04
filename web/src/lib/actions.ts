import { unstable_rethrow } from "next/navigation";

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Run a server-action body and turn thrown errors into a message the UI can show. Redirects pass through. */
export async function attempt<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong. Try again." };
  }
}

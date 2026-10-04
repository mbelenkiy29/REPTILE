import { notFound } from "next/navigation";
import { NotFoundError } from "./types";

/** Turn a NotFoundError from the data layer into the not-found page (404). */
export async function orNotFound<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}

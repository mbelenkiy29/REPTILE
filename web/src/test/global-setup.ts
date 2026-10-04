// Resets and migrates the test database once per run, when TEST_DATABASE_URL is set.
import postgres from "postgres";
import { migrate } from "../../db/migrate";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  if (!/test/.test(new URL(url).pathname)) throw new Error("TEST_DATABASE_URL must point at a database with 'test' in its name.");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe("drop schema public cascade; create schema public; create extension if not exists vector; create extension if not exists citext; create extension if not exists pgcrypto;");
  await sql.unsafe("drop schema if exists pgboss cascade;");
  await sql.end();
  await migrate(url, () => {});
}

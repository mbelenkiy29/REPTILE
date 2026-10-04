import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col justify-center gap-4 px-4">
      <h1 className="text-xl">REPTILE</h1>
      <p className="text-muted">
        AI review for every pull request. The app is being built screen by screen; the design system lives at{" "}
        <Link className="text-accent underline underline-offset-2" href="/design">/design</Link>.
      </p>
    </main>
  );
}

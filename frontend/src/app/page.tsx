"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [regionId, setRegionId] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (regionId.trim()) {
      router.push(`/regions/${regionId.trim()}`);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-md flex-col items-center gap-8 px-6">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Walkie
        </h1>
        <p className="text-center text-lg text-zinc-600 dark:text-zinc-400">
          Explore paths and streets within a region.
        </p>
        <form onSubmit={handleSubmit} className="flex w-full gap-3">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Region ID"
            value={regionId}
            onChange={(e) => setRegionId(e.target.value.replace(/\D/g, ""))}
            className="h-12 flex-1 rounded-lg border border-zinc-300 bg-white px-4 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={!regionId.trim()}
            className="h-12 rounded-lg bg-zinc-900 px-6 font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            See Paths
          </button>
        </form>
      </main>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/AuthContext";
import LoginForm from "@/components/LoginForm";

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <p className="text-zinc-500 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex w-full max-w-md flex-col items-center gap-8 px-6">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Walkie
          </h1>
          <p className="text-center text-lg text-zinc-600 dark:text-zinc-400">
            Explore paths and streets within a region.
          </p>
          <LoginForm />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-md flex-col items-center gap-8 px-6">
        <div className="flex w-full items-center justify-between">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Walkie
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {user.username}
            </span>
            <button
              type="button"
              onClick={logout}
              className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
            >
              Logout
            </button>
          </div>
        </div>
        <p className="text-center text-lg text-zinc-600 dark:text-zinc-400">
          Explore paths and streets within a region.
        </p>
        <button
          type="button"
          onClick={() => router.push("/explore")}
          className="h-12 rounded-lg bg-zinc-900 px-6 font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Browse regions
        </button>
      </main>
    </div>
  );
}

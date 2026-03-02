"use client";

import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/AuthContext";
import LoginForm from "@/components/LoginForm";
import { Button } from "@/components/ui/button";

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background font-sans">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background font-sans">
        <main className="flex w-full max-w-md flex-col items-center gap-8 px-6">
          <h1 className="text-4xl font-bold tracking-tight">
            Walkie
          </h1>
          <p className="text-center text-lg text-muted-foreground">
            Explore paths and streets within a region.
          </p>
          <LoginForm />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background font-sans">
      <main className="flex w-full max-w-md flex-col items-center gap-8 px-6">
        <div className="flex w-full items-center justify-between">
          <h1 className="text-4xl font-bold tracking-tight">
            Walkie
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {user.username}
            </span>
            <Button variant="ghost" size="sm" onClick={logout}>
              Logout
            </Button>
          </div>
        </div>
        <p className="text-center text-lg text-muted-foreground">
          Explore paths and streets within a region.
        </p>
        <Button
          className="h-12 px-6"
          onClick={() => router.push("/explore")}
        >
          Browse regions
        </Button>
      </main>
    </div>
  );
}

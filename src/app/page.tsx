"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { roleHome } from "@/lib/useSession";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          router.replace(roleHome(data.user.role));
        } else {
          router.replace("/login");
        }
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <p className="text-slate-400">Loading…</p>
    </div>
  );
}

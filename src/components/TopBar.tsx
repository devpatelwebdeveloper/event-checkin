"use client";

import { useRouter } from "next/navigation";
import { SessionUser } from "@/lib/useSession";

export default function TopBar({
  user,
  title,
}: {
  user: SessionUser;
  title: string;
}) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between">
      <div>
        <h1 className="text-lg sm:text-xl font-semibold text-slate-900">{title}</h1>
        <p className="text-xs text-slate-500">
          {user.name} · <span className="capitalize">{user.role}</span>
        </p>
      </div>
      <button
        onClick={handleLogout}
        className="text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
      >
        Sign out
      </button>
    </header>
  );
}

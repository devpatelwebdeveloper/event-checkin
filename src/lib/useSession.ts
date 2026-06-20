"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: "admin" | "registrar" | "viewer";
}

/**
 * Fetches the current session user. If `requiredRoles` is provided and the
 * user's role isn't in that list (or they're not logged in), redirects to /login.
 */
export function useSession(requiredRoles?: Array<SessionUser["role"]>) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setUser(data.user);
        setLoading(false);
        if (!data.user) {
          router.replace("/login");
        } else if (requiredRoles && !requiredRoles.includes(data.user.role)) {
          router.replace(roleHome(data.user.role));
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user, loading };
}

export function roleHome(role: SessionUser["role"]): string {
  if (role === "admin") return "/admin";
  if (role === "registrar") return "/registrar";
  return "/viewer";
}

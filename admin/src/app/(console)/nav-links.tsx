"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ waiting }: { waiting: number }) {
  const path = usePathname();
  const current = (prefix: string) => (path === prefix || path.startsWith(`${prefix}/`) ? "page" : undefined);
  return (
    <nav className="nav" aria-label="Sections">
      <Link href="/lessons" aria-current={current("/lessons")}>Lessons</Link>
      <Link href="/moderation" aria-current={current("/moderation")}>
        Moderation
        {waiting > 0 ? <span className="count" aria-label={`${waiting} waiting`}>{waiting}</span> : null}
      </Link>
    </nav>
  );
}

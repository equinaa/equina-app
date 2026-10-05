import Link from "next/link";
import { signOut } from "@/app/actions";
import { requireStaff } from "@/lib/staff";
import { NavLinks } from "./nav-links";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { supabase, email, role } = await requireStaff();
  const { data: waiting } = await supabase.rpc("staff_moderation_queue").select("content_id");
  const waitingCount = Array.isArray(waiting) ? waiting.length : 0;

  return (
    <>
      <header className="topbar">
        <Link href="/" className="wordmark">Equina <span>Admin</span></Link>
        <NavLinks waiting={waitingCount} />
        <div className="session">
          <span className="meta">{email} · {role === "admin" ? "Admin" : "Moderator"}</span>
          <form action={signOut}>
            <button type="submit" className="button quiet">Sign out</button>
          </form>
        </div>
      </header>
      {children}
    </>
  );
}

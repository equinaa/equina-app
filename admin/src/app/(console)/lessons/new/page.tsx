import type { Metadata } from "next";
import Link from "next/link";
import { requireStaff } from "@/lib/staff";
import { LessonForm } from "../lesson-form";

export const metadata: Metadata = { title: "New lesson" };

export default async function NewLessonPage() {
  await requireStaff();
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <Link href="/lessons" className="back">← Lessons</Link>
          <h1>New lesson</h1>
          <p className="meta">Starts as a draft. Riders see nothing until you publish it.</p>
        </div>
      </div>
      <section className="panel" aria-label="Lesson details">
        <LessonForm mode="create" values={{ access: "paid", position: "0" }} />
      </section>
    </main>
  );
}

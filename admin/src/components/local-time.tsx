"use client";

import { useEffect, useState } from "react";

const styles = {
  date: { day: "numeric", month: "short", year: "numeric" },
  long: { day: "numeric", month: "long", year: "numeric" },
  moment: { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
} satisfies Record<string, Intl.DateTimeFormatOptions>;

// Times in the staff member's own time zone. The server renders in UTC (where
// Vercel runs) and says so; the browser then swaps in local time.
export function LocalTime({ iso, style }: { iso: string; style: keyof typeof styles }) {
  const date = new Date(iso);
  const [text, setText] = useState(() =>
    `${new Intl.DateTimeFormat("en-GB", { ...styles[style], timeZone: "UTC" }).format(date)}${style === "moment" ? " UTC" : ""}`
  );
  useEffect(() => {
    setText(new Intl.DateTimeFormat("en-GB", styles[style]).format(new Date(iso)));
  }, [iso, style]);
  return <time dateTime={iso}>{text}</time>;
}

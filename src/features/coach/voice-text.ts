/** Joins what was said to what is already in the box, with one space between. */
export const joinSpoken = (before: string, spoken: string) => {
  const head = before.replace(/\s+$/, "");
  const tail = spoken.trim();
  if (!tail) return before;
  return head ? `${head} ${tail}` : tail;
};

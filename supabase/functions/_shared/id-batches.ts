// A filter like `.in("record_id", ids)` puts every id in the request URL.
// A hundred UUIDs come to about 4,000 characters, under the 8 KB request line
// the API gateway accepts; a few hundred would not be, and the request would
// fail. Longer lists are read in batches of this size.
export const ID_BATCH_SIZE = 100;

export const idBatches = (ids: string[], size = ID_BATCH_SIZE): string[][] => {
  const batches: string[][] = [];
  for (let start = 0; start < ids.length; start += size) batches.push(ids.slice(start, start + size));
  return batches;
};

// Reads the rows for every id, one batch after another, and returns them in
// batch order. No ids, no request.
export const readInBatches = async <T>(
  ids: string[],
  read: (batch: string[]) => Promise<T[]>,
  size = ID_BATCH_SIZE,
): Promise<T[]> => {
  const rows: T[] = [];
  for (const batch of idBatches(ids, size)) rows.push(...await read(batch));
  return rows;
};

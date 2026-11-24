/**
 * The largest file a record takes: the limit create-upload-ticket holds for a
 * record's file (horse_record), which tests/upload-flow.test.ts keeps equal.
 *
 * An upload reads the whole file before the server learns its size
 * (upload-flow.ts), so a file over the limit is refused here, when it is
 * chosen, before anything is read into memory: a 150 MB scan would otherwise
 * be loaded on the phone only to be told it is too large.
 *
 * This trusts the size the document picker reports, which is the size of the
 * very file it hands over. A photo picker's is not (it can report the file it
 * started from), which is why photos have no such early check.
 */
export const recordFileMaxBytes = 20 * 1024 * 1024;

export const recordFileTooLarge = (byteSize: number | null | undefined) =>
  typeof byteSize === "number" && byteSize > recordFileMaxBytes;

export const recordFileTooLargeMessage = "This file is too large. A record takes a file of up to 20 MB.";

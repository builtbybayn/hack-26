/** Let explorer actions wait for local edits before moving their saved records to Trash. */
const editors = new Set<() => Promise<boolean>>();
export function registerNoteFlush(flush: () => Promise<boolean>) {
  editors.add(flush);
  return () => {
    editors.delete(flush);
  };
}
export async function flushNoteEdits() {
  const results = await Promise.all([...editors].map((flush) => flush()));
  if (results.some((saved) => !saved))
    throw new Error("An open note could not be saved. Retry saving it before deleting.");
}

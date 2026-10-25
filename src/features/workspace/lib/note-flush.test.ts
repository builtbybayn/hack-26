import { afterEach, expect, it, vi } from "vitest";
import { flushNoteEdits, registerNoteFlush } from "./note-flush";
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});
it("waits for all open note editors to save before deletion proceeds", async () => {
  let finish!: (saved: boolean) => void;
  const save = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  cleanups.push(registerNoteFlush(save));
  const pending = flushNoteEdits();
  expect(save).toHaveBeenCalledOnce();
  finish(true);
  await expect(pending).resolves.toBeUndefined();
});
it("blocks deletion if an editor could not save", async () => {
  cleanups.push(registerNoteFlush(async () => false));
  await expect(flushNoteEdits()).rejects.toThrow("could not be saved");
});
it("does not save editors after they have unmounted", async () => {
  const save = vi.fn(async () => true);
  const unregister = registerNoteFlush(save);
  unregister();
  await flushNoteEdits();
  expect(save).not.toHaveBeenCalled();
});

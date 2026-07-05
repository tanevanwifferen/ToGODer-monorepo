import { mergeMemories } from "../sync/mergeUtils";
import { SyncableMemory } from "../sync/types";

const mem = (value: string, updatedAt: number): SyncableMemory => ({
  value,
  updatedAt,
});

const tomb = (updatedAt: number, deletedAt: number): SyncableMemory => ({
  value: "",
  updatedAt,
  deleted: true,
  deletedAt,
});

describe("mergeMemories", () => {
  it("treats undefined sides as empty (backwards compatible)", () => {
    expect(mergeMemories(undefined, undefined)).toEqual({});
    const one = { "/a": mem("x", 1) };
    expect(mergeMemories(one, undefined)).toEqual(one);
    expect(mergeMemories(undefined, one)).toEqual(one);
  });

  it("picks higher updatedAt per key (LWW)", () => {
    const local = { "/a": mem("local", 2), "/b": mem("local-b", 5) };
    const remote = { "/a": mem("remote", 10), "/b": mem("remote-b", 1) };
    const out = mergeMemories(local, remote);
    expect(out["/a"].value).toBe("remote");
    expect(out["/b"].value).toBe("local-b");
  });

  it("unions keys that only exist on one side", () => {
    const local = { "/only-local": mem("L", 1) };
    const remote = { "/only-remote": mem("R", 1) };
    const out = mergeMemories(local, remote);
    expect(out["/only-local"].value).toBe("L");
    expect(out["/only-remote"].value).toBe("R");
  });

  it("tombstone with later deletedAt wins over older value", () => {
    const local = { "/a": tomb(1, 20) };
    const remote = { "/a": mem("resurrected?", 10) };
    const out = mergeMemories(local, remote);
    expect(out["/a"].deleted).toBe(true);
  });

  it("newer value wins over older tombstone", () => {
    const local = { "/a": tomb(1, 5) };
    const remote = { "/a": mem("new", 10) };
    const out = mergeMemories(local, remote);
    expect(out["/a"].deleted).toBeFalsy();
    expect(out["/a"].value).toBe("new");
  });

  it("two tombstones: later deletedAt wins (tombstones preserved)", () => {
    const local = { "/a": tomb(1, 5) };
    const remote = { "/a": tomb(1, 10) };
    const out = mergeMemories(local, remote);
    expect(out["/a"].deleted).toBe(true);
    expect(out["/a"].deletedAt).toBe(10);
  });
});

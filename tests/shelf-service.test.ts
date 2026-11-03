import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  readFile,
  rm,
  mkdir,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ShelfService,
  type ShelfEnvironment,
} from "../src/main/shelf-service.ts";
import type {
  ShelfItem,
  ShelfResult,
  ShelfTemplate,
} from "../src/shelf-types.ts";

async function fileSymlink(source: string, link: string): Promise<boolean> {
  try {
    await symlink(source, link);
    return true;
  } catch (error) {
    if (
      process.platform === "win32" &&
      ["EPERM", "EACCES", "ENOTSUP"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )
    )
      return false;
    throw error;
  }
}

function fixture() {
  let context = {
    space: "normal" as "normal" | "private",
    epoch: 1,
    live: true,
  };
  const records: Record<string, ShelfItem[]> = { normal: [], private: [] };
  const templates: Record<string, ShelfTemplate[]> = {
    normal: [],
    private: [],
  };
  const payloads = new Map<string, Buffer>();
  let sequence = 0;
  const snapshot = (space: string) => ({
    templates: templates[space].map((x) => ({ ...x })),
    items: records[space].map((x) => ({ ...x })),
    totalBytes: records[space].reduce((n, x) => n + x.bytes, 0),
    revision: sequence,
    unavailable: false,
    error: "",
  });
  const add = async (
    space: string,
    item: Omit<ShelfItem, "id" | "createdAt" | "pinned">,
    valid = () => true,
  ): Promise<ShelfResult> => {
    if (!valid()) return { ok: false };
    records[space].push({
      ...item,
      id: String(++sequence),
      createdAt: sequence,
      pinned: false,
    });
    return { ok: true, snapshot: snapshot(space) };
  };
  const store = {
    list: snapshot,
    addTemplate: async (
      space: string,
      input: { title: string; body: string },
      valid = () => true,
    ) => {
      if (!valid()) return { ok: false };
      const now = ++sequence;
      templates[space].push({
        ...input,
        id: String(now),
        createdAt: now,
        updatedAt: now,
      });
      return { ok: true, snapshot: snapshot(space) };
    },
    updateTemplate: async (
      space: string,
      id: string,
      input: { title: string; body: string },
      valid = () => true,
    ) => {
      const template = templates[space].find((x) => x.id === id);
      if (!valid() || !template) return { ok: false };
      Object.assign(template, input, { updatedAt: ++sequence });
      return { ok: true, snapshot: snapshot(space) };
    },
    removeTemplate: async (space: string, id: string, valid = () => true) => {
      const index = templates[space].findIndex((x) => x.id === id);
      if (!valid() || index < 0) return { ok: false };
      templates[space].splice(index, 1);
      sequence++;
      return { ok: true, snapshot: snapshot(space) };
    },
    addText: (space: string, text: string, valid?: () => boolean) =>
      add(
        space,
        {
          kind: "text",
          name: "Nội dung",
          text,
          bytes: Buffer.byteLength(text),
          mime: "text/plain",
        },
        valid,
      ),
    addBinary: async (
      space: string,
      input: {
        kind: "image" | "file";
        name: string;
        mime: string;
        data: Buffer;
      },
      valid?: () => boolean,
    ) => {
      const r = await add(
        space,
        {
          kind: input.kind,
          name: input.name,
          bytes: input.data.length,
          mime: input.mime,
        },
        valid,
      );
      if (r.ok) payloads.set(String(sequence), Buffer.from(input.data));
      return r;
    },
    readBinary: async (space: string, id: string) =>
      records[space].some((x) => x.id === id)
        ? Buffer.from(payloads.get(id) ?? [])
        : null,
    pin: async () => ({ ok: false }),
    remove: async () => ({ ok: false }),
    clearUnpinned: async () => ({ ok: false }),
  };
  const clipboard: { text?: string; data?: Buffer }[] = [];
  const textWrites: string[] = [];
  let clipboardReads = 0;
  let changes = 0;
  let picked: string[] = [];
  let destination: string | undefined;
  let reader: ShelfEnvironment["readClipboard"] = async () => ({
    kind: "text",
    text: "hello\nthere",
  });
  let picker: ShelfEnvironment["pickFiles"] = async () => picked;
  let imageCalls = 0;
  const env: ShelfEnvironment = {
    current: () => context,
    readClipboard: () => {
      clipboardReads++;
      return reader();
    },
    writeText: async (text) => {
      textWrites.push(text);
    },
    writeClipboard: async (item, data) => {
      clipboard.push(item.text !== undefined ? { text: item.text } : { data });
    },
    pickFiles: () => picker(),
    saveFile: async () => destination,
    imagePreview: async () => {
      imageCalls++;
      return Buffer.from("preview");
    },
    onSurface: () => {},
    onChange: () => {
      changes++;
    },
  };
  const service = new ShelfService(store, env);
  const request = (action: string, extra = {}) =>
    service.handle({ action, lockVersion: context.epoch, ...extra });
  return {
    service,
    request,
    store,
    records,
    templates,
    clipboard,
    textWrites,
    clipboardReads: () => clipboardReads,
    changes: () => changes,
    context,
    env,
    setReader: (r: typeof reader) => (reader = r),
    setPicker: (p: typeof picker) => (picker = p),
    setPicked: (p: string[]) => (picked = p),
    setDestination: (p: string) => (destination = p),
    imageCalls: () => imageCalls,
  };
}

test("shelf rejects stale and malformed requests without exposing namespace contents", async () => {
  const f = fixture();
  await f.request("add-text", { text: "normal-only" });
  assert.equal(
    (await f.service.handle({ action: "list", lockVersion: 0 })).ok,
    false,
  );
  assert.equal(
    (
      await f.service.handle({
        action: "list",
        lockVersion: 1,
        space: "private",
        path: "/etc/passwd",
      })
    ).ok,
    false,
  );
  f.context.space = "private";
  f.context.epoch++;
  const r = await f.request("list");
  assert.deepEqual(r.snapshot?.items, []);
  assert.equal(f.service.summary().count, 0);
});

test("template CRUD lists both collections and mutates only the current namespace", async () => {
  const f = fixture();
  await f.store.addText("normal", "shelf item");
  const added = await f.request("add-template", {
    title: "Greeting",
    body: "Hello\n\tthere",
  });
  assert.equal(added.ok, true);
  const template = added.snapshot!.templates[0];
  assert.equal(template.title, "Greeting");
  assert.equal(template.body, "Hello\n\tthere");
  assert.equal(added.snapshot!.items[0].text, "shelf item");
  assert.equal(f.changes(), 1);
  assert.deepEqual(f.textWrites, []);
  assert.deepEqual(f.clipboard, []);
  assert.equal(
    (
      await f.request("update-template", {
        templateId: template.id,
        title: "Edited",
        body: "Updated body",
      })
    ).ok,
    true,
  );
  const listed = await f.request("list");
  assert.equal(listed.snapshot!.templates[0].title, "Edited");
  assert.equal(listed.snapshot!.templates[0].body, "Updated body");
  assert.equal(f.changes(), 2);
  f.context.space = "private";
  f.context.epoch++;
  assert.deepEqual((await f.request("list")).snapshot!.templates, []);
  assert.equal(
    (
      await f.request("add-template", {
        title: "Private",
        body: "Private body",
      })
    ).ok,
    true,
  );
  f.context.space = "normal";
  f.context.epoch++;
  assert.equal(
    (await f.request("remove-template", { templateId: template.id })).ok,
    true,
  );
  assert.deepEqual((await f.request("list")).snapshot!.templates, []);
  assert.equal(f.templates.private[0].body, "Private body");
  assert.equal(f.changes(), 4);
  assert.equal(f.clipboardReads(), 0);
});

test("template requests reject malformed fields, foreign keys, and item IDs", async () => {
  const f = fixture();
  await f.store.addTemplate("normal", {
    title: "Existing",
    body: "Stored body",
  });
  for (const request of [
    { action: "add-template", title: 1, body: "body" },
    { action: "add-template", title: "title" },
    { action: "add-template", title: "title", body: null },
    { action: "add-template", title: "title", body: "body", unknown: true },
    { action: "add-template", title: "title", body: "body", id: "1" },
    { action: "update-template", templateId: "1", title: "title" },
    { action: "update-template", templateId: 1, title: "title", body: "body" },
    { action: "remove-template" },
    { action: "remove-template", templateId: "1", body: "override" },
    { action: "copy-template", id: "1" },
    { action: "copy-template", templateId: "1", text: "override" },
    { action: "copy-template", templateId: "1", body: "override" },
  ]) {
    const result = await f.service.handle({ ...request, lockVersion: 1 });
    assert.equal(result.ok, false, JSON.stringify(request));
    assert.equal(result.snapshot, undefined);
  }
  assert.equal(f.templates.normal.length, 1);
  assert.equal(f.templates.normal[0].body, "Stored body");
  assert.equal(f.changes(), 0);
  assert.deepEqual(f.textWrites, []);
});

test("template mutations carry an epoch guard through deferred store work", async () => {
  for (const action of ["add-template", "update-template", "remove-template"]) {
    const f = fixture();
    await f.store.addTemplate("normal", {
      title: "Original",
      body: "Original body",
    });
    const before = structuredClone(f.templates);
    let finish!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const add = f.store.addTemplate;
    const update = f.store.updateTemplate;
    const remove = f.store.removeTemplate;
    f.store.addTemplate = async (...args) => {
      await waiting;
      return add(...args);
    };
    f.store.updateTemplate = async (...args) => {
      await waiting;
      return update(...args);
    };
    f.store.removeTemplate = async (...args) => {
      await waiting;
      return remove(...args);
    };
    const request = f.request(
      action,
      action === "remove-template"
        ? { templateId: "1" }
        : {
            ...(action === "update-template" ? { templateId: "1" } : {}),
            title: "Changed",
            body: "Changed body",
          },
    );
    await new Promise((resolve) => setImmediate(resolve));
    f.context.epoch += 2;
    finish();
    const result = await request;
    assert.equal(result.ok, false);
    assert.equal(result.snapshot, undefined);
    assert.deepEqual(f.templates, before);
    assert.equal(f.changes(), 0);
  }
});

test("missing and cross-namespace template IDs cannot edit, remove, or copy", async () => {
  const f = fixture();
  await f.store.addTemplate("normal", {
    title: "Normal",
    body: "normal secret",
  });
  await f.store.addText("private", "item text");
  f.context.space = "private";
  f.context.epoch++;
  for (const templateId of ["1", "2", "missing"]) {
    for (const action of [
      "update-template",
      "remove-template",
      "copy-template",
    ]) {
      const result = await f.request(action, {
        templateId,
        ...(action === "update-template"
          ? { title: "Changed", body: "Changed" }
          : {}),
      });
      assert.equal(result.ok, false);
      assert.equal(result.snapshot, undefined);
      assert.equal(JSON.stringify(result).includes("normal secret"), false);
    }
  }
  assert.equal(f.templates.normal[0].body, "normal secret");
  assert.equal(f.changes(), 0);
  assert.deepEqual(f.textWrites, []);
  assert.deepEqual(f.clipboard, []);
  assert.equal(f.clipboardReads(), 0);
});

test("explicit template copy writes the exact stored body once without reading clipboard", async () => {
  const f = fixture();
  await f.request("add-template", {
    title: "Title is not copied",
    body: "  Hello\n\tthere  ",
  });
  await f.request("list");
  assert.deepEqual(f.textWrites, []);
  const result = await f.request("copy-template", { templateId: "1" });
  assert.equal(result.ok, true);
  assert.equal(result.snapshot, undefined);
  assert.deepEqual(f.textWrites, ["  Hello\n\tthere  "]);
  assert.deepEqual(f.clipboard, []);
  assert.equal(f.clipboardReads(), 0);
  assert.equal(f.changes(), 1);
});

test("queued template copy becomes stale after epoch changes without exposing prior-space data", async () => {
  const f = fixture();
  await f.store.addTemplate("private", {
    title: "Private",
    body: "prior-space secret",
  });
  f.context.space = "private";
  let finish!: (value: null) => void;
  f.setReader(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const reading = f.request("clipboard");
  await new Promise((resolve) => setImmediate(resolve));
  const copying = f.request("copy-template", { templateId: "1" });
  f.context.space = "normal";
  f.context.epoch++;
  finish(null);
  const result = await copying;
  await reading;
  assert.equal(result.ok, false);
  assert.match(result.message!, /Không gian đã thay đổi/);
  assert.equal(result.snapshot, undefined);
  assert.equal(JSON.stringify(result).includes("prior-space secret"), false);
  assert.deepEqual(f.textWrites, []);
  assert.deepEqual(f.clipboard, []);
  assert.equal(f.clipboardReads(), 1);
});

test("queued template copy reads the current stored body when its turn begins", async () => {
  const f = fixture();
  await f.store.addTemplate("normal", { title: "Reply", body: "old body" });
  let finish!: (value: null) => void;
  f.setReader(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const reading = f.request("clipboard");
  await new Promise((resolve) => setImmediate(resolve));
  const copying = f.request("copy-template", { templateId: "1" });
  await f.store.updateTemplate("normal", "1", {
    title: "Reply",
    body: "new body",
  });
  finish(null);
  await reading;
  assert.equal((await copying).ok, true);
  assert.deepEqual(f.textWrites, ["new body"]);
});

test("template copy finishing after a lock responds stale and keeps later copies queued", async () => {
  const f = fixture();
  await f.store.addTemplate("private", {
    title: "Reply",
    body: "explicit secret",
  });
  f.context.space = "private";
  let finish!: () => void;
  f.env.writeText = (text) => {
    f.textWrites.push(text);
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const first = f.request("copy-template", { templateId: "1" });
  await new Promise((resolve) => setImmediate(resolve));
  const second = f.request("copy-template", { templateId: "1" });
  assert.deepEqual(f.textWrites, ["explicit secret"]);
  f.context.space = "normal";
  f.context.epoch++;
  finish();
  for (const result of await Promise.all([first, second])) {
    assert.equal(result.ok, false);
    assert.match(result.message!, /Không gian đã thay đổi/);
    assert.equal(result.snapshot, undefined);
    assert.equal(JSON.stringify(result).includes("explicit secret"), false);
  }
  assert.deepEqual(f.textWrites, ["explicit secret"]);
  assert.equal(f.clipboardReads(), 0);
});

test("clipboard read finishing after switch-away-and-back cannot add or copy content", async () => {
  const f = fixture();
  let finish!: (v: { kind: "text"; text: string }) => void;
  f.setReader(() => new Promise((resolve) => (finish = resolve)));
  const reading = f.request("clipboard");
  await new Promise((resolve) => setImmediate(resolve));
  f.context.epoch += 2;
  finish({ kind: "text", text: "old secret" });
  assert.equal((await reading).ok, false);
  assert.equal(f.records.normal.length, 0);
  assert.equal(f.records.private.length, 0);
  assert.deepEqual(f.clipboard, []);
});

test("file picker cancelled by epoch cannot copy selected files into either shelf", async () => {
  const f = fixture();
  let finish!: (v: string[]) => void;
  f.setPicker(() => new Promise((resolve) => (finish = resolve)));
  const request = f.request("pick-files");
  await new Promise((resolve) => setImmediate(resolve));
  f.context.epoch++;
  f.context.space = "private";
  finish(["/does-not-exist"]);
  assert.equal((await request).ok, false);
  assert.equal(f.records.normal.length + f.records.private.length, 0);
});

test("selected regular files are independent copies and oversized batches are rejected", async () => {
  const root = await mkdtemp(join(tmpdir(), "gom-shelf-service-"));
  try {
    const source = join(root, "quote.txt");
    await writeFile(source, "original");
    const f = fixture();
    f.setPicked([source]);
    assert.equal((await f.request("pick-files")).ok, true);
    await writeFile(source, "changed");
    assert.equal(
      (await f.store.readBinary("normal", "1"))?.toString(),
      "original",
    );
    f.setPicked(Array.from({ length: 11 }, () => source));
    assert.equal((await f.request("pick-files")).ok, false);
    assert.equal(f.records.normal.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("selected symbolic links are rejected without adding their target bytes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "gom-shelf-symlink-"));
  try {
    const source = join(root, "quote.txt"),
      link = join(root, "link.txt");
    await writeFile(source, "original");
    if (!(await fileSymlink(source, link))) {
      t.skip("Windows runner does not permit file symlinks");
      return;
    }
    const f = fixture();
    f.setPicked([link]);
    assert.equal((await f.request("pick-files")).ok, false);
    assert.equal(f.records.normal.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("export cancellation preserves existing destination and successful export writes exact bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "gom-shelf-export-"));
  try {
    const f = fixture();
    const destination = join(root, "export.bin");
    await writeFile(destination, "keep");
    await f.store.addBinary("normal", {
      kind: "file",
      name: "a.bin",
      mime: "application/octet-stream",
      data: Buffer.from([0, 1, 255]),
    });
    f.setDestination(destination);
    let finish!: (v: string | undefined) => void;
    f.env.saveFile = () => new Promise((resolve) => (finish = resolve));
    const exporting = f.request("export", { id: "1" });
    await new Promise((resolve) => setImmediate(resolve));
    f.context.epoch += 2;
    finish(destination);
    assert.equal((await exporting).ok, false);
    assert.equal(await readFile(destination, "utf8"), "keep");
    f.env.saveFile = async () => destination;
    assert.equal((await f.request("export", { id: "1" })).ok, true);
    assert.deepEqual(await readFile(destination), Buffer.from([0, 1, 255]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("wrong-namespace copy and oversized PNG dimensions never reach clipboard or decoder", async () => {
  const f = fixture();
  await f.request("add-text", { text: "normal only" });
  f.context.space = "private";
  f.context.epoch++;
  assert.equal((await f.request("copy", { id: "1" })).ok, false);
  assert.deepEqual(f.clipboard, []);
  const png = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.write("IHDR", 12);
  png.writeUInt32BE(100000, 16);
  png.writeUInt32BE(100000, 20);
  f.setReader(async () => ({ kind: "image", data: png }));
  assert.equal((await f.request("clipboard")).ok, false);
  assert.equal(f.imageCalls(), 0);
});

test("surface closes without stale re-open and text copy preserves LF/tab", async () => {
  const f = fixture();
  await f.request("surface", { open: true });
  assert.equal(f.service.summary().open, true);
  f.service.close();
  assert.equal(f.service.summary().open, false);
  f.context.epoch++;
  assert.equal(
    (await f.service.handle({ action: "surface", open: true, lockVersion: 1 }))
      .ok,
    false,
  );
  await f.request("add-text", { text: "hello\n\tworld" });
  await f.request("copy", { id: "1" });
  assert.deepEqual(f.clipboard, [{ text: "hello\n\tworld" }]);
});

test("shutdown cancels abandoned native dialogs, ignores late choices and rejects new work", async () => {
  for (const action of ["pick-files", "export"] as const) {
    const f = fixture();
    await f.store.addBinary("normal", {
      kind: "file",
      name: "abandoned.bin",
      mime: "application/octet-stream",
      data: Buffer.from("private bytes"),
    });
    let finish!: () => void;
    if (action === "pick-files")
      f.env.pickFiles = () =>
        new Promise((resolve) => {
          finish = () => resolve(["/late/secret"]);
        });
    else
      f.env.saveFile = () =>
        new Promise((resolve) => {
          finish = () => resolve("/late/secret");
        });
    const pending = f.request(action, { id: "1" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(
      typeof f.service.shutdown,
      "function",
      "service must own shutdown of pending binary work",
    );
    await Promise.race([
      f.service.shutdown(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(Error("shutdown waited for an abandoned dialog")),
          1000,
        ).unref(),
      ),
    ]);
    assert.equal((await pending).ok, false);
    assert.equal(
      (await f.request("add-text", { text: "after shutdown" })).ok,
      false,
    );
    assert.equal((await f.request("surface", { open: true })).ok, false);
    assert.equal(f.service.summary().open, false);
    finish();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.records.normal.length, 1);
    await f.service.shutdown();
  }
});

test("mixed file selection reports each safe basename and reason without paths or stale names", async () => {
  const root = await mkdtemp(join(tmpdir(), "gom-shelf-batch-"));
  try {
    const f = fixture();
    const good = join(root, "good.txt"),
      missing = join(root, "missing.txt"),
      link = join(root, "shortcut.txt"),
      quota = join(root, "quota.bin"),
      unsafe = join(root, "unsafe\nname.txt");
    await writeFile(good, "good");
    await writeFile(quota, "quota");
    // Windows cannot create a filename containing a newline. Still send the
    // hostile picker path to exercise safe labels and a per-file rejection.
    if (process.platform !== "win32") await writeFile(unsafe, "unsafe");
    const hasSymlink = await fileSymlink(good, link);
    // Keep the mixed batch active on runners without symlink privileges.
    if (!hasSymlink) await mkdir(link);
    const add = f.store.addBinary;
    f.store.addBinary = async (space, input, valid) =>
      input.name === "quota.bin"
        ? { ok: false, message: "Khay đã đầy. Hãy xóa mục trước khi thêm." }
        : input.name.includes("\n")
          ? { ok: false, message: "Tên hoặc loại tệp không hợp lệ." }
          : add(space, input, valid);
    const longName = "é".repeat(180) + ".txt";
    f.setPicked([good, missing, link, quota, unsafe, join(root, longName)]);
    const result = await f.request("pick-files");
    assert.equal(result.ok, true);
    assert.equal(result.snapshot?.items.length, 1);
    assert.equal(
      result.message!.split("\n").length,
      6,
      "all five rejected selections receive a reason",
    );
    assert.match(result.message!, /missing\.txt[^\n]*không còn/i);
    assert.match(
      result.message!,
      hasSymlink
        ? /shortcut\.txt[^\n]*liên kết/i
        : /shortcut\.txt[^\n]*(?:tệp thường|quyền đọc)/i,
    );
    assert.match(result.message!, /quota\.bin[^\n]*đầy/i);
    assert.match(
      result.message!,
      process.platform === "win32"
        ? /unsafe_name\.txt[^\n]*(?:không còn|chưa đọc được)/i
        : /unsafe_name\.txt[^\n]*không hợp lệ/i,
    );
    assert.equal(result.message!.includes(root), false);
    assert.equal(result.message!.includes("unsafe\nname.txt"), false);
    assert.equal(result.message!.includes(longName), false);
    assert.ok(
      Buffer.byteLength(result.message!) < 1800,
      "file labels and reasons are bounded",
    );
    const stale = fixture();
    stale.store.addBinary = async () => {
      stale.context.epoch++;
      return { ok: false, message: "old private filename" };
    };
    stale.setPicked([good]);
    const cancelled = await stale.request("pick-files");
    assert.equal(cancelled.ok, false);
    assert.equal(cancelled.message!.includes("good.txt"), false);
    assert.equal(cancelled.message!.includes("old private filename"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

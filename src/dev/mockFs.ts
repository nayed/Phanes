/**
 * Development only: an in-memory file system for the browser mock, seeded
 * with docs/sample-workspace mounted at ~/notes (as in the design screens).
 */

type Handlers = Record<string, (args: Record<string, unknown>) => unknown>;

export const MOCK_HOME = "/home/nayed";
export const MOCK_ROOT = `${MOCK_HOME}/notes`;

const texts = import.meta.glob("/docs/sample-workspace/**/*.{md,markdown}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const images = import.meta.glob("/docs/sample-workspace/**/*.{png,jpg,jpeg,gif,svg,webp}", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** path → file contents (string) or image URL; folders are implied by `dirs`. */
const files = new Map<string, { text?: string; url?: string }>();
const dirs = new Set<string>([MOCK_HOME, MOCK_ROOT]);

const toMock = (p: string) => MOCK_ROOT + p.slice("/docs/sample-workspace".length);
for (const [p, text] of Object.entries(texts)) files.set(toMock(p), { text });
for (const [p, url] of Object.entries(images)) files.set(toMock(p), { url });
for (const p of files.keys()) {
  for (let d = parent(p); d.length > MOCK_ROOT.length; d = parent(d)) dirs.add(d);
}

function parent(p: string): string {
  return p.slice(0, p.lastIndexOf("/")) || "/";
}
function name(p: string): string {
  return p.slice(p.lastIndexOf("/") + 1);
}
function exists(p: string): boolean {
  return files.has(p) || dirs.has(p);
}
function kind(p: string) {
  if (dirs.has(p)) return "directory";
  if (/\.(md|markdown)$/i.test(p)) return "markdown";
  if (/\.(png|jpe?g|gif|svg|webp)$/i.test(p)) return "image";
  return "other";
}
function fail(message: string): never {
  throw message;
}

/** URL a mock image can be displayed from (the preview uses it instead of the asset protocol). */
export function mockImageUrl(path: string): string | undefined {
  return files.get(path)?.url;
}

export function installMockFs(add: (handlers: Handlers) => void): void {
  add({
    "plugin:path|resolve_directory": () => MOCK_HOME,
    "plugin:dialog|open": () => MOCK_ROOT,
    "plugin:dialog|save": ({ options }) => {
      const o = options as { defaultPath?: string } | undefined;
      return window.prompt("Save as (mock dialog)", o?.defaultPath ?? `${MOCK_ROOT}/untitled.md`);
    },
    "plugin:clipboard-manager|write_text": ({ text }) => console.info("[mock clipboard]", text),
    "plugin:opener|open_url": ({ url }) => console.info("[mock opener] open", url),
    open_workspace: ({ path }) => {
      const p = String(path).replace(/\/+$/, "");
      return dirs.has(p) ? p : fail(`Cannot open ${p}: not found`);
    },
    allow_asset_dir: () => null,
    list_dir: ({ path }) => {
      const dir = String(path);
      if (!dirs.has(dir)) fail(`Cannot list ${dir}: not found`);
      const entries = [...dirs, ...files.keys()]
        .filter((p) => p !== dir && parent(p) === dir && !name(p).startsWith("."))
        .map((p) => ({ name: name(p), path: p, kind: kind(p) }));
      return entries.sort(
        (a, b) =>
          Number(b.kind === "directory") - Number(a.kind === "directory") ||
          a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
      );
    },
    path_info: ({ path }) => ({ exists: exists(String(path)), isDir: dirs.has(String(path)) }),
    read_text_file: ({ path }) => {
      const f = files.get(String(path));
      return f?.text ?? fail(`Cannot open ${path}: not found`);
    },
    write_text_file: ({ path, contents }) => {
      files.set(String(path), { text: String(contents) });
    },
    create_file: ({ path }) => {
      if (exists(String(path))) fail(`Cannot create ${path}: already exists`);
      files.set(String(path), { text: "" });
    },
    create_dir: ({ path }) => {
      if (exists(String(path))) fail(`Cannot create ${path}: already exists`);
      dirs.add(String(path));
    },
    rename_path: ({ from, to }) => {
      const f = String(from);
      const t = String(to);
      if (exists(t)) fail(`Cannot rename: ${t} already exists`);
      move(f, t);
    },
    duplicate_path: ({ path }) => {
      const p = String(path);
      const dot = dirs.has(p) ? -1 : name(p).lastIndexOf(".");
      const stem = dot > 0 ? p.slice(0, p.length - name(p).length + dot) : p;
      const ext = dot > 0 ? name(p).slice(dot) : "";
      let n = 1;
      let target = `${stem} copy${ext}`;
      while (exists(target)) target = `${stem} copy ${++n}${ext}`;
      copy(p, target);
      return target;
    },
    trash_path: ({ path }) => {
      const p = String(path);
      for (const k of [...files.keys()]) if (k === p || k.startsWith(`${p}/`)) files.delete(k);
      for (const d of [...dirs]) if (d === p || d.startsWith(`${p}/`)) dirs.delete(d);
    },
    reveal_path: ({ path }) => console.info("[mock] reveal", path),
  });
}

function move(from: string, to: string): void {
  copy(from, to);
  for (const k of [...files.keys()]) if (k === from || k.startsWith(`${from}/`)) files.delete(k);
  for (const d of [...dirs]) if (d === from || d.startsWith(`${from}/`)) dirs.delete(d);
}

function copy(from: string, to: string): void {
  for (const [k, v] of [...files]) if (k === from || k.startsWith(`${from}/`)) files.set(to + k.slice(from.length), v);
  for (const d of [...dirs]) if (d === from || d.startsWith(`${from}/`)) dirs.add(to + d.slice(from.length));
}

/** Small POSIX path helpers (Phanes only targets Linux). */

export function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

export function dirname(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const i = trimmed.lastIndexOf("/");
  if (i <= 0) return "/";
  return trimmed.slice(0, i);
}

export function join(...parts: string[]): string {
  return normalize(parts.filter(Boolean).join("/"));
}

/** Collapse "//", "." and ".." segments. */
export function normalize(path: string): string {
  const absolute = path.startsWith("/");
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else if (!absolute) out.push("..");
      continue;
    }
    out.push(seg);
  }
  return (absolute ? "/" : "") + out.join("/") || (absolute ? "/" : ".");
}

/** Resolve `target` (absolute or relative) against the folder `base`. */
export function resolve(base: string, target: string): string {
  return target.startsWith("/") ? normalize(target) : join(base, target);
}

export function extname(path: string): string {
  const name = basename(path);
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i) : "";
}

/** Whether `path` is `parent` itself or inside it. */
export function isInside(path: string, parent: string): boolean {
  return path === parent || path.startsWith(parent.endsWith("/") ? parent : `${parent}/`);
}

/** Replace the `from` prefix of `path` with `to` (after a folder rename). */
export function rebase(path: string, from: string, to: string): string {
  return path === from ? to : to + path.slice(from.length);
}

export function isMarkdown(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
}

let home: string | null = null;

export function setHomeDir(dir: string): void {
  home = dir.replace(/\/+$/, "");
}

/** "/home/nayed/notes" → "~/notes". */
export function tildify(path: string): string {
  if (home && isInside(path, home)) return "~" + path.slice(home.length);
  return path;
}

/** "~/notes" → "/home/nayed/notes" (unchanged without a known home folder). */
export function expandHome(path: string): string {
  if (!home) return path;
  if (path === "~") return home;
  return path.startsWith("~/") ? home + path.slice(1) : path;
}

/**
 * Vim's `pathshorten`, after `tildify`: every folder down to its first
 * character (a leading dot kept), the file name whole.
 * "/home/nayed/Codes/Misc/Phanes/src-tauri/src/app_state.rs" → "~/C/M/P/s/s/app_state.rs".
 */
export function shortenPath(path: string): string {
  const parts = tildify(path).split("/");
  return parts
    .map((part, i) => {
      if (i === parts.length - 1 || part === "" || part === "~") return part;
      return part.startsWith(".") ? part.slice(0, 2) : part.slice(0, 1);
    })
    .join("/");
}

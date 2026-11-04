import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";
import type { VFile } from "vfile";
import { assetUrl } from "../../lib/fs";
import { resolve } from "../../lib/path";

const REMOTE = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Images: relative paths resolve against the open file's folder and load
 * through Tauri's asset protocol. Remote images are never fetched (Phanes
 * makes no network requests); their alt text is shown instead.
 */
export function rehypeLocalImages() {
  return (tree: Root, file: VFile) => {
    const baseDir = (file.data as { baseDir?: string }).baseDir;
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "img") return;
      const src = String(node.properties.src ?? "");
      if (!src) return;
      if (REMOTE.test(src) || src.startsWith("//")) {
        if (parent && index !== undefined) {
          parent.children[index] = {
            type: "element",
            tagName: "span",
            properties: { className: ["remote-image"], title: src },
            children: [{ type: "text", value: String(node.properties.alt || "Remote image") }],
          };
        }
        return;
      }
      if (!baseDir) return;
      let path = src;
      try {
        path = decodeURI(src);
      } catch {
        // Keep the raw value.
      }
      node.properties.src = assetUrl(resolve(baseDir, path.split(/[?#]/)[0]));
      node.properties.loading = "lazy";
    });
  };
}

import { invoke } from "@tauri-apps/api/core";

export interface LaunchPath {
  path: string;
  exists: boolean;
  isDir: boolean;
}

/** The paths given on the command line, already absolute (see src-tauri/src/cli.rs). */
export const launchPaths = () => invoke<LaunchPath[]>("launch_paths");

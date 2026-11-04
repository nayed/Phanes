/** Development only: an in-memory file system for the browser mock. Filled in with the fs commands. */
export function installMockFs(_add: (handlers: Record<string, (args: Record<string, unknown>) => unknown>) => void): void {}

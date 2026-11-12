/** The machine a run was measured on, so runs from different machines aren't compared blindly. */
export interface RunEnvironment {
  node: string;
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCount: number;
  totalMemoryBytes: number;
  /** Commit the code ran from; `null` outside a git checkout (e.g. in a container image). */
  gitCommit: string | null;
  /**
   * Tracked files had uncommitted changes, so `gitCommit` doesn't fully describe the code.
   * Untracked files are ignored: recorded runs themselves are new files.
   */
  gitDirty: boolean | null;
}

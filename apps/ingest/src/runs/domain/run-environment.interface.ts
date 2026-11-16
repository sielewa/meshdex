/** The machine a run was measured on, so runs from different machines aren't compared blindly. */
export interface RunEnvironment {
  node: string;
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCount: number;
  totalMemoryBytes: number;
  gitCommit: string | null;
  /** Untracked files are ignored: recorded runs themselves are new files. */
  gitDirty: boolean | null;
}

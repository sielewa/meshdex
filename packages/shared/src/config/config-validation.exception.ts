export class ConfigValidationException extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    this.name = 'ConfigValidationException';
  }
}

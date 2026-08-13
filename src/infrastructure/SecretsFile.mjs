import fs from 'node:fs';
import path from 'node:path';

/**
 * The one place a project's real credentials live: API keys, provider
 * tokens, anything a sandbox needs but must not be copied into a sandbox
 * by hand. Every sandbox of the project reads the same file.
 *
 * Format is `KEY=value` per line, `#` starts a comment, and surrounding
 * quotes are stripped. A missing file is not an error — a project may need
 * no credentials at all.
 */
export class SecretsFile {
  constructor(filePath) {
    this.filePath = filePath;
  }

  read() {
    if (!fs.existsSync(this.filePath)) return {};
    const entries = {};
    for (const line of fs.readFileSync(this.filePath, 'utf8').split('\n')) {
      const parsed = this.parseLine(line);
      if (parsed) entries[parsed.key] = parsed.value;
    }
    return entries;
  }

  /**
   * Line numbers of content that is neither a comment nor `KEY=value`.
   * Those lines contribute nothing, and a credential that was meant to be
   * there is indistinguishable from one that was never added unless someone
   * says so.
   */
  malformedLineNumbers() {
    if (!fs.existsSync(this.filePath)) return [];
    return fs
      .readFileSync(this.filePath, 'utf8')
      .split('\n')
      .map((line, index) => ({ line, number: index + 1 }))
      .filter((entry) => this.isContent(entry.line) && !this.parseLine(entry.line))
      .map((entry) => entry.number);
  }

  isContent(line) {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith('#');
  }

  parseLine(line) {
    if (!this.isContent(line)) return null;
    const trimmed = line.trim();
    const separator = trimmed.indexOf('=');
    if (separator < 1) return null;
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    return { key, value: this.stripQuotes(rawValue) };
  }

  stripQuotes(value) {
    const quoted = value.length >= 2 && (value.startsWith('"') || value.startsWith("'"));
    return quoted && value.endsWith(value[0]) ? value.slice(1, -1) : value;
  }

  /** Creates the file with an explanatory header when it does not exist yet. */
  ensureExists() {
    if (fs.existsSync(this.filePath)) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(
      this.filePath,
      '# Credentials shared by every sandbox of this project.\n' +
        '# One KEY=value per line. Referenced from the env templates as ${KEY}.\n',
      { mode: 0o600 },
    );
  }
}

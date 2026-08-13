const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

export interface TextStream {
  write(chunk: string): boolean;
  readonly isTTY?: boolean;
}

/** Writes the tool's own output. Child processes write to the terminal directly. */
export class Terminal {
  private readonly output: TextStream;
  private readonly errorOutput: TextStream;
  private readonly colored: boolean;

  constructor(output: TextStream = process.stdout, errorOutput: TextStream = process.stderr) {
    this.output = output;
    this.errorOutput = errorOutput;
    this.colored = output.isTTY === true;
  }

  heading(text: string): void {
    this.output.write(`${this.paint(BOLD, text)}\n`);
  }

  info(text: string): void {
    this.output.write(`${text}\n`);
  }

  /** A single step of a longer operation, kept visually below its heading. */
  step(text: string): void {
    this.output.write(`${this.paint(DIM, `  → ${text}`)}\n`);
  }

  /** Secondary line attached to whatever was printed above it. */
  detail(text: string): void {
    this.output.write(`${this.paint(DIM, text)}\n`);
  }

  warn(text: string): void {
    this.errorOutput.write(`${this.paint(YELLOW, `warning: ${text}`)}\n`);
  }

  error(text: string): void {
    this.errorOutput.write(`${this.paint(RED, `error: ${text}`)}\n`);
  }

  /** Follow-up to an error: what to do about it, indented under the message. */
  errorHint(text: string): void {
    for (const line of text.split('\n')) {
      this.errorOutput.write(`${this.paint(DIM, `       ${line}`)}\n`);
    }
  }

  blank(): void {
    this.output.write('\n');
  }

  /** Renders rows of equal length as a left-aligned table with a header row. */
  table(headers: readonly string[], rows: readonly (readonly (string | number)[])[]): void {
    const widths = headers.map((header, column) =>
      Math.max(header.length, ...rows.map((row) => String(row[column]).length)),
    );
    this.info(this.paint(DIM, this.formatRow(headers, widths)));
    for (const row of rows) this.info(this.formatRow(row, widths));
  }

  private formatRow(cells: readonly (string | number)[], widths: readonly number[]): string {
    return cells.map((cell, column) => String(cell).padEnd(widths[column] ?? 0)).join('  ');
  }

  private paint(code: string, text: string): string {
    return this.colored ? `${code}${text}${RESET}` : text;
  }
}

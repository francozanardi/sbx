const DIM = '\u001b[2m';
const BOLD = '\u001b[1m';
const YELLOW = '\u001b[33m';
const RED = '\u001b[31m';
const RESET = '\u001b[0m';

/** Writes the tool's own output. Child processes write to the terminal directly. */
export class Terminal {
  constructor(output = process.stdout, errorOutput = process.stderr) {
    this.output = output;
    this.errorOutput = errorOutput;
    this.colored = output.isTTY === true;
  }

  heading(text) {
    this.output.write(`${this.paint(BOLD, text)}\n`);
  }

  info(text) {
    this.output.write(`${text}\n`);
  }

  /** A single step of a longer operation, kept visually below its heading. */
  step(text) {
    this.output.write(`${this.paint(DIM, `  → ${text}`)}\n`);
  }

  /** Secondary line attached to whatever was printed above it. */
  detail(text) {
    this.output.write(`${this.paint(DIM, text)}\n`);
  }

  warn(text) {
    this.errorOutput.write(`${this.paint(YELLOW, `warning: ${text}`)}\n`);
  }

  error(text) {
    this.errorOutput.write(`${this.paint(RED, `error: ${text}`)}\n`);
  }

  /** Follow-up to an error: what to do about it, indented under the message. */
  errorHint(text) {
    for (const line of String(text).split('\n')) {
      this.errorOutput.write(`${this.paint(DIM, `       ${line}`)}\n`);
    }
  }

  blank() {
    this.output.write('\n');
  }

  /** Renders rows of equal length as a left-aligned table with a header row. */
  table(headers, rows) {
    const widths = headers.map((header, column) =>
      Math.max(header.length, ...rows.map((row) => String(row[column]).length)),
    );
    this.info(this.paint(DIM, this.formatRow(headers, widths)));
    for (const row of rows) this.info(this.formatRow(row, widths));
  }

  formatRow(cells, widths) {
    return cells.map((cell, column) => String(cell).padEnd(widths[column])).join('  ');
  }

  paint(code, text) {
    return this.colored ? `${code}${text}${RESET}` : text;
  }
}

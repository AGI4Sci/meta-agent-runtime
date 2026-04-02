export class ParseError extends Error {
  readonly rawText: string;

  constructor(message: string, rawText: string) {
    super(message);
    this.name = "ParseError";
    this.rawText = rawText;
  }
}


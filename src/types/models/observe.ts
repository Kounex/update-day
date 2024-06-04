export class Observe {
  public readonly userId: string;
  public readonly createdAtMS: number;
  public readonly updatedAtMS: number;
  public readonly name: string;
  public readonly url: string;
  public readonly cssSelector: string;
  public readonly currentText: string;
  public readonly domElementProperty: string | null;

  constructor(
    userId: string,
    createdAtMS: number,
    updatedAtMS: number,
    name: string,
    url: string,
    cssSelector: string,
    currentText: string,
    domElementProperty: string | null
  ) {
    this.userId = userId;
    this.createdAtMS = createdAtMS;
    this.updatedAtMS = updatedAtMS;
    this.name = name;
    this.url = url;
    this.cssSelector = cssSelector;
    this.currentText = currentText;
    this.domElementProperty = domElementProperty;
  }

  public toString(): string {
    return `${this.name}\n${this.cssSelector}\n${this.url}\n${
      this.currentText
    }${this.domElementProperty != null ? '\n' + this.name : ''}\n`;
  }
}

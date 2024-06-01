export class Observe {
  readonly userId: string;
  readonly createdAtMS: number;
  readonly updatedAtMS: number;
  readonly name: string;
  readonly url: string;
  readonly cssSelector: string;
  readonly currentText: string;
  readonly domElementProperty: string | null;

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
}

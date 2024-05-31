export class Observe {
  name: string;
  url: string;
  cssSelector: string;
  currentText: string;
  domElementProperty: string | null;

  constructor(
    name: string,
    url: string,
    cssSelector: string,
    currentText: string,
    domElementProperty: string | null
  ) {
    this.name = name;
    this.url = url;
    this.cssSelector = cssSelector;
    this.currentText = currentText;
    this.domElementProperty = domElementProperty;
  }
}

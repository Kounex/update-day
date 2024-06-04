import { parse } from 'css-what';

export class Observe {
  private constructor(
    public readonly userId: string,
    public readonly createdAtMS: number,
    public readonly updatedAtMS: number,
    public readonly name: string,
    public readonly url: string,
    public readonly cssSelector: string,
    public readonly currentText: string,
    public readonly domElementProperty: string | null
  ) {}

  public static create(
    userId: string,
    createdAtMS: number,
    updatedAtMS: number,
    name: string,
    url: string,
    cssSelector: string,
    currentText: string,
    domElementProperty: string | null
  ): Observe | Error {
    if (!this.isValidURL(url)) {
      return {
        name: 'NotValidAttribute',
        message:
          'Not a valid URL - has comply with the `URL` spec in general and contain `http` / `https`!',
      };
    }
    if (!this.isValidCSSSelector(cssSelector)) {
      return {
        name: 'NotValidAttribute',
        message: 'Not a valid CSS-Selector!',
      };
    }

    return new Observe(
      userId,
      createdAtMS,
      updatedAtMS,
      name,
      url,
      cssSelector,
      currentText,
      domElementProperty
    );
  }

  public toString(): string {
    return `${this.name}\n${this.cssSelector}\n${this.url}\n${
      this.currentText
    }${this.domElementProperty != null ? '\n' + this.name : ''}\n`;
  }

  private static isValidCSSSelector(selector: string): boolean {
    try {
      parse(selector);
      return true;
    } catch {
      return false;
    }
  }

  private static isValidURL(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }
}

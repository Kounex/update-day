export interface CommandResult {
  readonly successful: boolean;
  readonly message?: string;

  //   constructor(successful: boolean, message: string) {
  //     this.successful = successful;
  //     this.message = message;
  //   }
}

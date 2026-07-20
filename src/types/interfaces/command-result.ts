import { Observe } from '../models/observe.js';

export interface CommandResult {
  readonly successful: boolean;
  readonly message?: string;
  readonly observe?: Observe;

  //   constructor(successful: boolean, message: string) {
  //     this.successful = successful;
  //     this.message = message;
  //   }
}

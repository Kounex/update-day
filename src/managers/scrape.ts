import { injectable } from 'inversify';
import { Observe } from '../types/models/observe';

@injectable()
export default class {
  observers: Observe[] = [];

  constructor() {}

  addObserve(observe: Observe) {
    this.observers.push(observe);
  }

  editObserve(name: string, observe: Observe): boolean {
    return true;
  }

  deleteObserve(userId: string, name: string | null): boolean {
    return true;
  }
}

import EventEmitter from "node:events";

type EventMap<T> = Record<keyof T, any[]>;

export class EventBroadcaster<T extends EventMap<T>> {
  eventEmitters = new Set<EventEmitter<T>>();
  constructor(eventEmitters: Iterable<EventEmitter>) {
    this.eventEmitters = new Set(eventEmitters);
  }
  addEventEmitter(eventEmitter: EventEmitter<T>) {
    return this.eventEmitters.add(eventEmitter);
  }
  removeEventEmitter(eventEmitter: EventEmitter<T>) {
    return this.eventEmitters.delete(eventEmitter);
  }

  emit<E extends string | symbol>(eventName: {} extends T ? string | symbol : E | keyof EventEmitter.EventEmitterEventMap | (keyof T & (string | symbol)), ...args: {} extends T ? any[] : E extends keyof T ? T[E] : E extends keyof EventEmitter.EventEmitterEventMap ? EventEmitter.EventEmitterEventMap[E] : any[]): boolean {
    return this.eventEmitters[Symbol.iterator]().some((v) => v.emit(eventName, ...args));
  }
}
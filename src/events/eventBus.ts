import { EventEmitter } from "events";

export type EventMap = {
  "assignment.created": [
    payload: {
      assignmentId: string;
      classId: string;
      title: string;
      description?: string | null;
      deadline: Date;
      className: string;
      teacherName: string;
    }
  ];
};

class TypedEmitter<T extends Record<string, unknown[]>> {
  private emitter = new EventEmitter();

  public on<K extends keyof T & string>(event: K, listener: (...args: T[K]) => void): void {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  public off<K extends keyof T & string>(event: K, listener: (...args: T[K]) => void): void {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
  }

  public emit<K extends keyof T & string>(event: K, ...args: T[K]): void {
    this.emitter.emit(event, ...args);
  }
}

export const eventBus = new TypedEmitter<EventMap>();

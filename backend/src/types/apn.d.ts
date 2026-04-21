// Stub type declarations for 'apn' — replaced by the real package once installed.
// This allows tsc to compile without @types/apn being present.
declare module 'apn' {
  export class Provider {
    constructor(options: any);
    send(notification: Notification, recipients: string | string[]): Promise<any>;
    shutdown(): void;
  }
  export class Notification {
    alert: any;
    sound: string;
    topic: string;
    payload: any;
    badge?: number;
  }
}

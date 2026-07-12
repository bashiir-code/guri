// Provider-adapter interface (§11): the pilot swaps ConsoleSmsAdapter for a
// local aggregator adapter (e.g. Hormuud enterprise SMS) without touching
// callers.
export const SMS_PORT = Symbol('SMS_PORT');

export interface SmsPort {
  send(phone: string, message: string): Promise<void>;
}

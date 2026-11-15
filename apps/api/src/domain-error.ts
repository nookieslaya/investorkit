export class CashApiError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) { super(message); }
}

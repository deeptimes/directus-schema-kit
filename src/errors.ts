export type ErrorCode = 'CONFIG_ERROR' | 'VALIDATION_ERROR' | 'BUILD_ERROR' | 'CONNECTION_ERROR'

export class DskError extends Error {
  constructor(
    message: string,
    readonly code: ErrorCode,
    readonly details: string[] = [],
  ) {
    super(message)
    this.name = 'DskError'
  }
}

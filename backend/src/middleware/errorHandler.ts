import { Request, Response, NextFunction } from 'express';

/**
 * Error codes for client-side error handling and retry logic
 */
export enum ErrorCode {
  // Client errors (4xx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  
  // Server errors (5xx) - potentially retryable
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TRANSCRIPTION_FAILED = 'TRANSCRIPTION_FAILED',
  EXPORT_FAILED = 'EXPORT_FAILED',
  STORAGE_ERROR = 'STORAGE_ERROR',
  FFMPEG_ERROR = 'FFMPEG_ERROR',
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
}

/**
 * Retryable error codes - client can safely retry these
 */
const RETRYABLE_ERRORS = new Set<ErrorCode>([
  ErrorCode.SERVICE_UNAVAILABLE,
  ErrorCode.TRANSCRIPTION_FAILED,
  ErrorCode.EXPORT_FAILED,
  ErrorCode.STORAGE_ERROR,
  ErrorCode.EXTERNAL_API_ERROR,
]);

export interface ErrorResponseBody {
  success: false;
  error: string;
  code: ErrorCode;
  retryable: boolean;
  retryAfter?: number; // seconds to wait before retry
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  statusCode: number;
  code: ErrorCode;
  isOperational: boolean;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Check if this error is retryable
   */
  get isRetryable(): boolean {
    return RETRYABLE_ERRORS.has(this.code);
  }
}

/**
 * Create common error instances
 */
export const Errors = {
  notFound: (resource: string) => 
    new AppError(`${resource} not found`, 404, ErrorCode.NOT_FOUND),
  
  validation: (message: string, details?: Record<string, unknown>) => 
    new AppError(message, 400, ErrorCode.VALIDATION_ERROR, details),
  
  unauthorized: (message = 'Unauthorized') => 
    new AppError(message, 401, ErrorCode.UNAUTHORIZED),
  
  forbidden: (message = 'Forbidden') => 
    new AppError(message, 403, ErrorCode.FORBIDDEN),
  
  fileTooLarge: (maxSize: string) => 
    new AppError(`File size exceeds limit of ${maxSize}`, 413, ErrorCode.FILE_TOO_LARGE),
  
  invalidFileType: (allowedTypes: string[]) => 
    new AppError(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`, 415, ErrorCode.INVALID_FILE_TYPE),
  
  transcriptionFailed: (message: string) => 
    new AppError(message, 500, ErrorCode.TRANSCRIPTION_FAILED),
  
  exportFailed: (message: string) => 
    new AppError(message, 500, ErrorCode.EXPORT_FAILED),
  
  storageError: (message: string) => 
    new AppError(message, 500, ErrorCode.STORAGE_ERROR),
  
  ffmpegError: (message: string) => 
    new AppError(message, 500, ErrorCode.FFMPEG_ERROR),
  
  externalApiError: (service: string, message: string) => 
    new AppError(`${service}: ${message}`, 502, ErrorCode.EXTERNAL_API_ERROR),
  
  serviceUnavailable: (message = 'Service temporarily unavailable') => 
    new AppError(message, 503, ErrorCode.SERVICE_UNAVAILABLE),
};

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('Error:', err);

  if (err instanceof AppError) {
    const response: ErrorResponseBody = {
      success: false,
      error: err.message,
      code: err.code,
      retryable: err.isRetryable,
    };

    // Add retry-after hint for retryable errors
    if (err.isRetryable) {
      response.retryAfter = 5; // Default 5 seconds
    }

    if (err.details) {
      response.details = err.details;
    }

    return res.status(err.statusCode).json(response);
  }

  // Handle multer errors
  if (err.name === 'MulterError') {
    const code = (err as any).code === 'LIMIT_FILE_SIZE' 
      ? ErrorCode.FILE_TOO_LARGE 
      : ErrorCode.VALIDATION_ERROR;
    
    return res.status(400).json({
      success: false,
      error: 'File upload error: ' + err.message,
      code,
      retryable: false,
    } as ErrorResponseBody);
  }

  // Default error
  return res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    code: ErrorCode.INTERNAL_ERROR,
    retryable: false,
  } as ErrorResponseBody);
}

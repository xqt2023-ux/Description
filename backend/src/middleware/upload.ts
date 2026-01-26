import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';
import { Errors, ErrorCode } from './errorHandler';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

/**
 * Maximum file size per NFR-003: 500MB
 */
export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB in bytes
export const MAX_FILE_SIZE_DISPLAY = '500MB';

/**
 * Allowed MIME types for upload
 */
export const ALLOWED_VIDEO_MIMES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
];

export const ALLOWED_AUDIO_MIMES = [
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
];

export const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

export const ALLOWED_MIMES = [
  ...ALLOWED_VIDEO_MIMES,
  ...ALLOWED_AUDIO_MIMES,
  ...ALLOWED_IMAGE_MIMES,
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`INVALID_FILE_TYPE:${file.mimetype}`));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});

/**
 * Middleware to handle multer errors with proper error codes (T006)
 */
export function handleUploadError(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: `File size exceeds the maximum limit of ${MAX_FILE_SIZE_DISPLAY}`,
        code: ErrorCode.FILE_TOO_LARGE,
        retryable: false,
        details: {
          maxSize: MAX_FILE_SIZE,
          maxSizeDisplay: MAX_FILE_SIZE_DISPLAY,
        },
      });
    }
    return res.status(400).json({
      success: false,
      error: `Upload error: ${err.message}`,
      code: ErrorCode.VALIDATION_ERROR,
      retryable: false,
    });
  }
  
  if (err.message.startsWith('INVALID_FILE_TYPE:')) {
    const mimetype = err.message.split(':')[1];
    return res.status(415).json({
      success: false,
      error: `Invalid file type: ${mimetype}. Allowed types: ${ALLOWED_MIMES.join(', ')}`,
      code: ErrorCode.INVALID_FILE_TYPE,
      retryable: false,
      details: {
        receivedType: mimetype,
        allowedTypes: ALLOWED_MIMES,
      },
    });
  }
  
  next(err);
}

/**
 * Get media type from MIME type
 */
export function getMediaType(mimetype: string): 'video' | 'audio' | 'image' {
  if (ALLOWED_VIDEO_MIMES.includes(mimetype)) return 'video';
  if (ALLOWED_AUDIO_MIMES.includes(mimetype)) return 'audio';
  return 'image';
}

/**
 * MediaUploader Component (T014)
 * 
 * Drag-and-drop media upload with progress tracking.
 * Supports video, audio, and image files up to 500MB.
 */

'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, FileVideo, FileAudio, Image, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { mediaApi } from '@/lib/api';

interface UploadedMedia {
  id: string;
  filename: string;
  originalName: string;
  type: 'video' | 'audio' | 'image';
  size: number;
  url: string;
  metadata?: {
    duration?: number;
    width?: number;
    height?: number;
    fps?: number;
  };
}

interface MediaUploaderProps {
  projectId?: string;
  onUploadComplete?: (media: UploadedMedia) => void;
  onUploadError?: (error: string) => void;
  acceptedTypes?: ('video' | 'audio' | 'image')[];
  maxSizeMB?: number;
  className?: string;
}

interface UploadState {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
  result?: UploadedMedia;
}

const MAX_FILE_SIZE_MB = 500; // Matches backend NFR-003

const ACCEPTED_TYPES = {
  video: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/ogg', 'audio/webm', 'audio/x-m4a'],
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getMediaTypeFromMime(mimetype: string): 'video' | 'audio' | 'image' | null {
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.startsWith('image/')) return 'image';
  return null;
}

export function MediaUploader({
  projectId,
  onUploadComplete,
  onUploadError,
  acceptedTypes = ['video', 'audio', 'image'],
  maxSizeMB = MAX_FILE_SIZE_MB,
  className = '',
}: MediaUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptedMimes = acceptedTypes.flatMap(type => ACCEPTED_TYPES[type]);
  const acceptString = acceptedMimes.join(',');

  const validateFile = useCallback((file: File): string | null => {
    // Check file type
    const mediaType = getMediaTypeFromMime(file.type);
    if (!mediaType || !acceptedTypes.includes(mediaType)) {
      return `File type "${file.type}" is not supported. Accepted types: ${acceptedTypes.join(', ')}`;
    }

    // Check file size
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
      return `File size (${formatFileSize(file.size)}) exceeds maximum allowed (${maxSizeMB}MB)`;
    }

    return null;
  }, [acceptedTypes, maxSizeMB]);

  const uploadFile = useCallback(async (file: File) => {
    const uploadId = `${file.name}-${Date.now()}`;
    
    // Validate first
    const validationError = validateFile(file);
    if (validationError) {
      setUploads(prev => [...prev, {
        file,
        progress: 0,
        status: 'error',
        error: validationError,
      }]);
      onUploadError?.(validationError);
      return;
    }

    // Add to uploads list
    setUploads(prev => [...prev, {
      file,
      progress: 0,
      status: 'uploading',
    }]);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (projectId) {
        formData.append('projectId', projectId);
      }

      const response = await mediaApi.upload(formData, {
        onUploadProgress: (progressEvent: any) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploads(prev => prev.map(u => 
              u.file === file ? { ...u, progress } : u
            ));
          }
        },
      });

      const result = response.data.data as UploadedMedia;
      
      setUploads(prev => prev.map(u => 
        u.file === file ? { ...u, status: 'complete', progress: 100, result } : u
      ));

      onUploadComplete?.(result);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Upload failed';
      
      setUploads(prev => prev.map(u => 
        u.file === file ? { ...u, status: 'error', error: errorMessage } : u
      ));

      onUploadError?.(errorMessage);
    }
  }, [projectId, validateFile, onUploadComplete, onUploadError]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    
    Array.from(files).forEach(file => {
      uploadFile(file);
    });
  }, [uploadFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [handleFiles]);

  const removeUpload = useCallback((file: File) => {
    setUploads(prev => prev.filter(u => u.file !== file));
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(u => u.status !== 'complete' && u.status !== 'error'));
  }, []);

  const getFileIcon = (file: File) => {
    const type = getMediaTypeFromMime(file.type);
    switch (type) {
      case 'video': return <FileVideo className="w-5 h-5" />;
      case 'audio': return <FileAudio className="w-5 h-5" />;
      case 'image': return <Image className="w-5 h-5" />;
      default: return <Upload className="w-5 h-5" />;
    }
  };

  const hasActiveUploads = uploads.some(u => u.status === 'uploading');
  const hasCompletedUploads = uploads.some(u => u.status === 'complete' || u.status === 'error');

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Drop Zone */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors duration-200
          ${isDragOver 
            ? 'border-blue-500 bg-blue-500/10' 
            : 'border-gray-600 hover:border-gray-500 hover:bg-gray-800/50'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptString}
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
        
        <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragOver ? 'text-blue-500' : 'text-gray-500'}`} />
        
        <p className="text-lg font-medium text-gray-200 mb-2">
          {isDragOver ? 'Drop files here' : 'Drag & drop files here'}
        </p>
        
        <p className="text-sm text-gray-400 mb-4">
          or click to browse
        </p>
        
        <p className="text-xs text-gray-500">
          Supported: {acceptedTypes.join(', ')} • Max size: {maxSizeMB}MB
        </p>
      </div>

      {/* Upload List */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium text-gray-300">
              Uploads ({uploads.length})
            </h3>
            {hasCompletedUploads && !hasActiveUploads && (
              <button
                onClick={clearCompleted}
                className="text-xs text-gray-400 hover:text-gray-300"
              >
                Clear completed
              </button>
            )}
          </div>

          <div className="space-y-2">
            {uploads.map((upload, index) => (
              <div
                key={`${upload.file.name}-${index}`}
                className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg"
              >
                {/* File Icon */}
                <div className={`
                  ${upload.status === 'complete' ? 'text-green-500' : ''}
                  ${upload.status === 'error' ? 'text-red-500' : ''}
                  ${upload.status === 'uploading' ? 'text-blue-500' : ''}
                  ${upload.status === 'pending' ? 'text-gray-500' : ''}
                `}>
                  {getFileIcon(upload.file)}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">
                    {upload.file.name}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>{formatFileSize(upload.file.size)}</span>
                    {upload.result?.metadata?.duration && (
                      <>
                        <span>•</span>
                        <span>{formatDuration(upload.result.metadata.duration)}</span>
                      </>
                    )}
                    {upload.status === 'error' && (
                      <span className="text-red-400">{upload.error}</span>
                    )}
                  </div>
                  
                  {/* Progress Bar */}
                  {upload.status === 'uploading' && (
                    <div className="mt-2 w-full bg-gray-700 rounded-full h-1.5">
                      <div 
                        className="bg-blue-500 h-1.5 rounded-full transition-all duration-200"
                        style={{ width: `${upload.progress}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Status Icon */}
                <div className="flex-shrink-0">
                  {upload.status === 'uploading' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{upload.progress}%</span>
                      <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                    </div>
                  )}
                  {upload.status === 'complete' && (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  )}
                  {upload.status === 'error' && (
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  )}
                </div>

                {/* Remove Button */}
                {(upload.status === 'complete' || upload.status === 'error') && (
                  <button
                    onClick={() => removeUpload(upload.file)}
                    className="flex-shrink-0 text-gray-500 hover:text-gray-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default MediaUploader;

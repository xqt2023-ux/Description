'use client';

import { useState, useRef } from 'react';
import { Upload, Video, Music, Image, FolderOpen, Plus, Loader2, Cloud, HardDrive } from 'lucide-react';
import { useEditorStore } from '@/stores/editorStore';
import { MediaFile, Track, Clip } from '@shared/types';
import { mediaApi, getUploadUrl } from '@/lib/api';

export function MediaLibrary() {
  const [activeTab, setActiveTab] = useState<'media' | 'uploads'>('media');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [storageType, setStorageType] = useState<string>('local');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mediaFiles, addMediaFile, setVideoUrl, addTrack, tracks, setDuration, updateTrack, updateMediaThumbnails, updateClipThumbnails, projectId } = useEditorStore();

  // Generate thumbnails from video - async progressive mode
  const generateThumbnailsAsync = (
    videoUrl: string,
    duration: number,
    count: number = 10,
    onProgress: (thumbnails: string[], progress: number) => void
  ): void => {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';

    const thumbnails: string[] = [];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = 160;
    canvas.height = 90;

    let currentIndex = 0;
    const interval = duration / count;
    const batchSize = 10; // Update UI every 10 frames for better performance

    video.onloadeddata = () => {
      const captureFrame = () => {
        if (currentIndex >= count) {
          // Final update
          onProgress([...thumbnails], 100);
          video.src = ''; // Clean up
          return;
        }

        video.currentTime = currentIndex * interval;
      };

      video.onseeked = () => {
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumbnails.push(canvas.toDataURL('image/jpeg', 0.6));
          
          // Update progress periodically (every batchSize frames or at end)
          if (currentIndex % batchSize === 0 || currentIndex === count - 1) {
            const progress = Math.round((currentIndex / count) * 100);
            onProgress([...thumbnails], progress);
          }
        }
        currentIndex++;
        
        // Use requestAnimationFrame for smoother UI
        requestAnimationFrame(captureFrame);
      };

      captureFrame();
    };

    video.onerror = () => {
      onProgress([], 100); // Mark as complete even on error
    };
  };

  // Generate waveform from audio
  const generateWaveform = async (audioUrl: string): Promise<number[]> => {
    try {
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      const rawData = audioBuffer.getChannelData(0);
      const samples = 100;
      const blockSize = Math.floor(rawData.length / samples);
      const waveform: number[] = [];

      for (let i = 0; i < samples; i++) {
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(rawData[i * blockSize + j]);
        }
        waveform.push(sum / blockSize);
      }

      // Normalize
      const max = Math.max(...waveform);
      return waveform.map(v => v / max);
    } catch {
      return Array(100).fill(0.5);
    }
  };

  // Get media duration
  const getMediaDuration = (file: File, url: string): Promise<number> => {
    return new Promise((resolve) => {
      if (file.type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = url;
        video.onloadedmetadata = () => resolve(video.duration);
        video.onerror = () => resolve(10); // Default 10 seconds
      } else if (file.type.startsWith('audio/')) {
        const audio = document.createElement('audio');
        audio.src = url;
        audio.onloadedmetadata = () => resolve(audio.duration);
        audio.onerror = () => resolve(10);
      } else {
        resolve(5); // Default 5 seconds for images
      }
    });
  };

  // Add media to timeline
  const addMediaToTimeline = (media: MediaFile) => {
    const trackType = media.type === 'video' ? 'video' : 'audio';
    
    // Find existing track of same type
    let track = tracks.find(t => t.type === trackType);
    
    // Calculate start time (after last clip)
    let startTime = 0;
    if (track && track.clips.length > 0) {
      const lastClip = track.clips[track.clips.length - 1];
      startTime = lastClip.startTime + lastClip.duration;
    }

    // Create clip
    const clip: Clip = {
      id: crypto.randomUUID(),
      mediaId: media.id,
      name: media.name,
      startTime,
      duration: media.duration,
      sourceStart: 0,
      sourceEnd: media.duration,
      thumbnails: media.thumbnails,
      waveform: media.waveform,
    };

    if (!track) {
      // Create new track with the clip
      const newTrack: Track = {
        id: crypto.randomUUID(),
        type: trackType,
        name: trackType === 'video' ? 'Video Track' : 'Audio Track',
        clips: [clip],
        muted: false,
        volume: 1,
        locked: false,
      };
      addTrack(newTrack);
    } else {
      // Update existing track with new clip
      updateTrack(track.id, {
        clips: [...track.clips, clip],
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setIsUploading(true);
    setUploadProgress(0);

    for (const file of Array.from(files)) {
      try {
        // 1. Upload file to backend
        const uploadResponse = await mediaApi.upload(file, projectId || undefined, (progress) => {
          setUploadProgress(progress);
        });
        
        const serverMedia = uploadResponse.data.data;
        const serverMediaId = serverMedia.id;
        
        // 2. Create local blob URL for preview
        const localUrl = URL.createObjectURL(file);
        const serverUrl = getUploadUrl(serverMedia.url);
        
        const type = file.type.startsWith('video/')
          ? 'video'
          : file.type.startsWith('audio/')
          ? 'audio'
          : 'image';

        // Get duration
        const duration = await getMediaDuration(file, localUrl);

        // Generate waveform synchronously for audio (it's fast)
        let waveform: number[] = [];
        if (type === 'audio') {
          waveform = await generateWaveform(localUrl);
        }

        // Create media file with server ID
        const mediaFile: MediaFile = {
          id: serverMediaId, // Use server-assigned ID
          name: file.name,
          type,
          url: serverUrl, // Use server URL for persistence
          duration,
          size: file.size,
          thumbnails: [], // Empty initially for video
          waveform,
        };

        addMediaFile(mediaFile);

        // Add to timeline automatically
        addMediaToTimeline(mediaFile);

        // Generate thumbnails asynchronously for video (non-blocking)
        if (type === 'video') {
          const framesPerSecond = 1; // 1 thumbnail per second for clearer display (Descript-style)
          const frameCount = Math.ceil(duration * framesPerSecond);
          let uploadedThumbnailUrls: string[] = [];
          
          console.log(`🎬 Video duration: ${duration}s`);
          console.log(`🎬 FPS setting: ${framesPerSecond}`);
          console.log(`🎬 Frame count to generate: ${frameCount}`);
          
          // Start async thumbnail generation
          generateThumbnailsAsync(localUrl, duration, frameCount, async (thumbnails, progress) => {
            // Update local UI immediately with base64 thumbnails
            updateMediaThumbnails(serverMediaId, thumbnails);
            updateClipThumbnails(serverMediaId, thumbnails);
            
            if (progress < 100) {
              console.log(`Thumbnail generation: ${progress}% (${thumbnails.length}/${frameCount} frames)`);
            } else {
              console.log(`✅ Thumbnail generation complete: ${thumbnails.length} frames total`);
              
              // Upload thumbnails to server in batches (after all generated)
              try {
                const batchSize = 50; // Upload 50 at a time
                for (let i = 0; i < thumbnails.length; i += batchSize) {
                  const batch = thumbnails.slice(i, i + batchSize);
                  const response = await mediaApi.uploadThumbnails(serverMediaId, batch);
                  uploadedThumbnailUrls = [...uploadedThumbnailUrls, ...response.data.data.thumbnailUrls];
                  console.log(`Uploaded thumbnails: ${uploadedThumbnailUrls.length}/${thumbnails.length}`);
                }
                
                // Update with server URLs for persistence
                if (uploadedThumbnailUrls.length > 0) {
                  const serverThumbnailUrls = uploadedThumbnailUrls.map(url => getUploadUrl(url));
                  updateMediaThumbnails(serverMediaId, serverThumbnailUrls);
                  updateClipThumbnails(serverMediaId, serverThumbnailUrls);
                  console.log('Thumbnails saved to server successfully');
                }
              } catch (err) {
                console.error('Failed to upload thumbnails to server:', err);
                // Keep using local base64 thumbnails
              }
              
              // Clean up local blob URL
              URL.revokeObjectURL(localUrl);
            }
          });
        }

        // If it's a video, set it as the current video and update global duration
        if (type === 'video') {
          setVideoUrl(serverUrl);
          setDuration(duration);
        }
      } catch (error) {
        console.error('Failed to upload file:', error);
        // Fallback to local-only mode
        await handleLocalOnlyUpload(file);
      }
    }

    setIsUploading(false);
    setUploadProgress(0);
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Fallback for when server upload fails
  const handleLocalOnlyUpload = async (file: File) => {
    const url = URL.createObjectURL(file);
    const type = file.type.startsWith('video/')
      ? 'video'
      : file.type.startsWith('audio/')
      ? 'audio'
      : 'image';

    const duration = await getMediaDuration(file, url);
    let waveform: number[] = [];
    if (type === 'audio') {
      waveform = await generateWaveform(url);
    }

    const mediaId = crypto.randomUUID();
    const mediaFile: MediaFile = {
      id: mediaId,
      name: file.name,
      type,
      url,
      duration,
      size: file.size,
      thumbnails: [],
      waveform,
    };

    addMediaFile(mediaFile);
    addMediaToTimeline(mediaFile);

    if (type === 'video') {
      const framesPerSecond = 1; // 1 thumbnail per second for clearer display
      const frameCount = Math.ceil(duration * framesPerSecond);
      
      generateThumbnailsAsync(url, duration, frameCount, (thumbnails, progress) => {
        updateMediaThumbnails(mediaId, thumbnails);
        updateClipThumbnails(mediaId, thumbnails);
      });

      setVideoUrl(url);
      setDuration(duration);
    }
  };

  const handleMediaClick = (media: MediaFile) => {
    if (media.type === 'video') {
      setVideoUrl(media.url);
      setDuration(media.duration);
    }
  };

  const handleAddToTimeline = (media: MediaFile) => {
    addMediaToTimeline(media);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-editor-border">
        <button
          onClick={() => setActiveTab('media')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition ${
            activeTab === 'media'
              ? 'text-primary-400 border-b-2 border-primary-400'
              : 'text-editor-muted hover:text-white'
          }`}
        >
          Media
        </button>
        <button
          onClick={() => setActiveTab('uploads')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition ${
            activeTab === 'uploads'
              ? 'text-primary-400 border-b-2 border-primary-400'
              : 'text-editor-muted hover:text-white'
          }`}
        >
          Uploads
        </button>
      </div>

      {/* Upload Button */}
      <div className="p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,audio/*,image/*"
          multiple
          onChange={handleFileUpload}
          className="hidden"
          id="media-upload-input"
        />
        <label
          htmlFor="media-upload-input"
          className={`w-full bg-editor-border hover:bg-primary-500/20 border-2 border-dashed border-editor-border hover:border-primary-500 rounded-lg p-4 transition flex flex-col items-center gap-2 cursor-pointer ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
        >
          {isUploading ? (
            <>
              <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
              <span className="text-sm text-primary-400">Uploading... {uploadProgress}%</span>
              {/* Upload progress bar */}
              <div className="w-full h-1 bg-editor-bg rounded-full overflow-hidden mt-1">
                <div 
                  className="h-full bg-primary-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <Upload className="w-6 h-6 text-editor-muted" />
              <span className="text-sm text-editor-muted">Upload Media</span>
              <span className="text-xs text-editor-muted/60">Files are saved to server</span>
            </>
          )}
        </label>
      </div>

      {/* Media List */}
      <div className="flex-1 overflow-auto px-4 pb-4">
        {mediaFiles.length === 0 ? (
          <div className="text-center text-editor-muted py-8">
            <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No media files</p>
          </div>
        ) : (
          <div className="space-y-2">
            {mediaFiles.map((media) => (
              <div
                key={media.id}
                className="bg-editor-bg hover:bg-editor-border rounded-lg overflow-hidden transition"
              >
                {/* Thumbnail Preview */}
                {media.type === 'video' && media.thumbnails && media.thumbnails[0] && (
                  <div 
                    className="w-full h-20 bg-cover bg-center cursor-pointer"
                    style={{ backgroundImage: `url(${media.thumbnails[0]})` }}
                    onClick={() => handleMediaClick(media)}
                  />
                )}
                
                <button
                  onClick={() => handleMediaClick(media)}
                  className="w-full p-3 flex items-center gap-3 text-left"
                >
                  <div className="w-10 h-10 bg-editor-border rounded flex items-center justify-center flex-shrink-0">
                    {media.type === 'video' && <Video className="w-5 h-5 text-primary-400" />}
                    {media.type === 'audio' && <Music className="w-5 h-5 text-green-400" />}
                    {media.type === 'image' && <Image className="w-5 h-5 text-yellow-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{media.name}</p>
                    <p className="text-xs text-editor-muted">
                      {formatFileSize(media.size)} • {formatDuration(media.duration)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddToTimeline(media);
                    }}
                    className="p-1.5 hover:bg-primary-500/20 rounded transition"
                    title="Add to timeline"
                  >
                    <Plus className="w-4 h-4 text-primary-400" />
                  </button>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

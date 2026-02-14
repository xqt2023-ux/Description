'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { transcriptionApi, mediaApi, getUploadUrl } from '@/lib/api';
import Link from 'next/link';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize2,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Type,
  Image,
  Video,
  Music,
  Sparkles,
  Wand2,
  Settings,
  Share2,
  Download,
  Undo2,
  Redo2,
  Scissors,
  Copy,
  Trash2,
  ZoomIn,
  ZoomOut,
  Layers,
  FileText,
  MessageSquare,
  Clock,
  Upload,
  Mic,
  Monitor,
  Loader2,
  X,
  CheckCircle,
  AlertCircle,
  Grid3X3,
  Palette,
  User,
  Users,
  Edit3,
  Search,
  Home,
  Menu,
  ArrowLeft,
} from 'lucide-react';

interface DescriptEditorProps {
  projectId: string;
  initialMediaId?: string;
  initialMediaUrl?: string;
  initialTranscriptionId?: string;
  pendingFile?: File | null;
  isWaitingForFile?: boolean;
}

// 处理状态类型
interface ProcessingStatus {
  upload: 'idle' | 'processing' | 'completed' | 'error';
  uploadProgress: number;
  audioExtract: 'idle' | 'processing' | 'completed' | 'error';
  transcription: 'idle' | 'processing' | 'completed' | 'error';
  transcriptionProgress: number;
}

export function DescriptEditor({ projectId, initialMediaId, initialMediaUrl, initialTranscriptionId, pendingFile, isWaitingForFile }: DescriptEditorProps) {
  const [rightPanel, setRightPanel] = useState<'underlord' | 'project' | 'ai-tools' | 'properties' | 'elements' | 'captions' | 'media'>('underlord');
  const [showExportModal, setShowExportModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showProcessingPanel, setShowProcessingPanel] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    upload: 'idle',
    uploadProgress: 0,
    audioExtract: 'idle',
    transcription: 'idle',
    transcriptionProgress: 0,
  });
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [projectTitle, setProjectTitle] = useState('Untitled Project');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [canvasMode, setCanvasMode] = useState<'layout' | 'background'>('layout');
  const [showAddTrackMenu, setShowAddTrackMenu] = useState(false);
  const [customTracks, setCustomTracks] = useState<Array<{id: string; name: string; type: 'video' | 'audio' | 'text' | 'image'}>>([]);
  // Video clips for split functionality
  const [videoClips, setVideoClips] = useState<Array<{
    id: string;
    startTime: number;
    endTime: number;
    isDeleted: boolean;
  }>>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [audioData, setAudioData] = useState<number[]>([]);
  
  const {
    projectName,
    videoUrl,
    currentTime,
    duration,
    isPlaying,
    volume,
    isMuted,
    transcript,
    transcriptionStatus,
    setCurrentTime,
    setIsPlaying,
    setVolume,
    setIsMuted,
    setDuration,
    setVideoUrl,
    setTranscript,
    setTranscriptionStatus,
    tracks,
    addMediaFile,
    addTrack,
    seekTo,
  } = useEditorStore();

  // Handle user-initiated seeks
  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe(
      (state, prevState) => {
        if (state.seekVersion !== prevState.seekVersion && state.seekVersion > 0) {
          if (videoRef.current) {
            videoRef.current.currentTime = state.currentTime;
          }
        }
      }
    );
    return () => unsubscribe();
  }, []);

  // Handle pending file from homepage
  useEffect(() => {
    if (pendingFile) {
      setProjectTitle(pendingFile.name.replace(/\.[^/.]+$/, ''));
      setShowProcessingPanel(true);
      processFileFromHomepage(pendingFile);
    }
  }, [pendingFile]);

  // Process file: upload -> audio extract -> transcribe
  const processFileFromHomepage = async (file: File) => {
    try {
      setProcessingStatus(prev => ({ ...prev, upload: 'processing', uploadProgress: 0 }));
      
      const localPreviewUrl = URL.createObjectURL(file);
      setVideoUrl(localPreviewUrl);
      
      const progressInterval = setInterval(() => {
        setProcessingStatus(prev => {
          if (prev.uploadProgress >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return { ...prev, uploadProgress: prev.uploadProgress + 10 };
        });
      }, 200);
      
      const response = await mediaApi.upload(file);
      
      clearInterval(progressInterval);
      setProcessingStatus(prev => ({ 
        ...prev, 
        upload: 'completed', 
        uploadProgress: 100,
        audioExtract: 'processing'
      }));
      
      const mediaId = response.data.data.id;
      const mediaUrl = response.data.data.url;

      // Convert relative URL to absolute URL
      const fullMediaUrl = getUploadUrl(mediaUrl);
      setVideoUrl(fullMediaUrl);
      URL.revokeObjectURL(localPreviewUrl);
      
      addMediaFile({
        id: mediaId,
        name: file.name,
        type: file.type.startsWith('video/') ? 'video' : 'audio',
        url: mediaUrl,
        duration: 0,
        size: file.size,
        thumbnails: [],
      });
      
      setProcessingStatus(prev => ({ ...prev, audioExtract: 'completed', transcription: 'processing' }));
      
      const transcriptionResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/transcriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId, mediaUrl }),
      });
      
      const transcriptionData = await transcriptionResponse.json();
      const transcriptionId = transcriptionData.data.id;
      
      setTranscriptionStatus({ id: transcriptionId, status: 'processing', progress: 0 });
      pollTranscriptionWithProgress(transcriptionId);
      
    } catch (error) {
      console.error('Error processing file:', error);
      setProcessingStatus(prev => ({
        ...prev,
        upload: prev.upload === 'processing' ? 'error' : prev.upload,
        audioExtract: prev.audioExtract === 'processing' ? 'error' : prev.audioExtract,
        transcription: prev.transcription === 'processing' ? 'error' : prev.transcription,
      }));
    }
  };

  const pollTranscriptionWithProgress = async (transcriptionId: string) => {
    let progress = 0;
    const pollInterval = setInterval(async () => {
      try {
        const statusResponse = await transcriptionApi.getById(transcriptionId);
        const data = statusResponse.data.data;
        
        if (data.status === 'completed') {
          clearInterval(pollInterval);
          setProcessingStatus(prev => ({ ...prev, transcription: 'completed', transcriptionProgress: 100 }));
          setTranscriptionStatus({ id: transcriptionId, status: 'completed', progress: 100 });
          
          setTranscript({
            id: transcriptionId,
            mediaId: data.mediaId || '',
            language: data.language || 'en',
            segments: data.segments || [],
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          });
          
          setTimeout(() => setShowProcessingPanel(false), 2000);
        } else if (data.status === 'error') {
          clearInterval(pollInterval);
          setProcessingStatus(prev => ({ ...prev, transcription: 'error' }));
          setTranscriptionStatus({ id: transcriptionId, status: 'error', progress: 0, error: data.error });
        } else {
          progress = Math.min(progress + 5, 95);
          setProcessingStatus(prev => ({ ...prev, transcriptionProgress: progress }));
          setTranscriptionStatus({ id: transcriptionId, status: 'processing', progress });
        }
      } catch (error) {
        console.error('Error polling transcription:', error);
      }
    }, 2000);
  };

  // Retry handlers (T021)
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null);

  const handleRetryUpload = async () => {
    const file = lastUploadedFile;
    if (!file) return;
    
    setUploadError(null);
    setProcessingStatus(prev => ({ ...prev, upload: 'processing', uploadProgress: 0 }));
    
    try {
      const response = await mediaApi.upload(file);
      const mediaId = response.data.data.id;
      const mediaUrl = response.data.data.url;
      
      setVideoUrl(mediaUrl);
      setProcessingStatus(prev => ({ 
        ...prev, 
        upload: 'completed', 
        uploadProgress: 100,
      }));
      
      // Continue with transcription
      await startTranscriptionAfterUpload(mediaId, mediaUrl);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Upload failed';
      setUploadError(errorMessage);
      setProcessingStatus(prev => ({ ...prev, upload: 'error' }));
    }
  };

  const handleRetryTranscription = async () => {
    const transcriptionId = transcriptionStatus?.id;
    if (!transcriptionId) return;
    
    setTranscriptionError(null);
    setProcessingStatus(prev => ({ ...prev, transcription: 'processing', transcriptionProgress: 0 }));
    setTranscriptionStatus({ id: transcriptionId, status: 'processing', progress: 0 });
    
    try {
      await transcriptionApi.retryJob(transcriptionId);
      pollTranscriptionWithProgress(transcriptionId);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Retry failed';
      setTranscriptionError(errorMessage);
      setProcessingStatus(prev => ({ ...prev, transcription: 'error' }));
      setTranscriptionStatus({ id: transcriptionId, status: 'error', progress: 0, error: errorMessage });
    }
  };

  const startTranscriptionAfterUpload = async (mediaId: string, mediaUrl: string) => {
    setProcessingStatus(prev => ({ ...prev, audioExtract: 'processing' }));
    
    try {
      setProcessingStatus(prev => ({ ...prev, audioExtract: 'completed', transcription: 'processing' }));
      
      const transcriptionResponse = await transcriptionApi.startJob(mediaId);
      const jobId = transcriptionResponse.data.data.jobId;
      
      setTranscriptionStatus({ id: jobId, status: 'processing', progress: 0 });
      pollTranscriptionWithProgress(jobId);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Transcription failed';
      setTranscriptionError(errorMessage);
      setProcessingStatus(prev => ({ ...prev, audioExtract: 'completed', transcription: 'error' }));
    }
  };

  // Video controls
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const tenths = Math.floor((time % 1) * 10);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
  };

  // Descript-style time code format (0:00, 0:03, 0:10)
  const formatTimeCode = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Initialize video clips when duration is set
  useEffect(() => {
    if (duration > 0 && videoClips.length === 0) {
      setVideoClips([{
        id: `clip-${Date.now()}`,
        startTime: 0,
        endTime: duration,
        isDeleted: false,
      }]);
    }
  }, [duration]);

  // Split video at current playhead position
  const handleSplit = useCallback(() => {
    if (duration <= 0 || currentTime <= 0 || currentTime >= duration) return;
    
    // Find the clip that contains the current time
    const clipToSplit = videoClips.find(
      clip => !clip.isDeleted && currentTime > clip.startTime && currentTime < clip.endTime
    );
    
    if (!clipToSplit) return;
    
    // Create two new clips from the split
    const newClips = videoClips.map(clip => {
      if (clip.id === clipToSplit.id) {
        return {
          ...clip,
          endTime: currentTime,
        };
      }
      return clip;
    });
    
    // Add the second part of the split
    newClips.push({
      id: `clip-${Date.now()}`,
      startTime: currentTime,
      endTime: clipToSplit.endTime,
      isDeleted: false,
    });
    
    // Sort clips by start time
    newClips.sort((a, b) => a.startTime - b.startTime);
    
    setVideoClips(newClips);
  }, [currentTime, duration, videoClips]);

  // Keyboard shortcut for split (S key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleSplit();
      }
      
      // Space bar for play/pause
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSplit, togglePlay]);

  // Delete selected clip
  const handleDeleteClip = useCallback((clipId: string) => {
    setVideoClips(clips => clips.map(clip => 
      clip.id === clipId ? { ...clip, isDeleted: true } : clip
    ));
    setSelectedClipId(null);
  }, []);

  const skipForward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.min(videoRef.current.currentTime + 5, duration);
    }
  };

  const skipBackward = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 5, 0);
    }
  };

  // Handle file input
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProjectTitle(file.name.replace(/\.[^/.]+$/, ''));
      setShowProcessingPanel(true);
      processFileFromHomepage(file);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith('video/') || file.type.startsWith('audio/'))) {
      setProjectTitle(file.name.replace(/\.[^/.]+$/, ''));
      setShowProcessingPanel(true);
      processFileFromHomepage(file);
    }
  };

  // Get current word based on time
  const getCurrentWordIndex = () => {
    if (!transcript?.segments) return null;
    for (let i = 0; i < transcript.segments.length; i++) {
      const segment = transcript.segments[i];
      if (segment.words) {
        for (let j = 0; j < segment.words.length; j++) {
          const word = segment.words[j];
          if (currentTime >= word.startTime && currentTime <= word.endTime) {
            return { segmentIndex: i, wordIndex: j };
          }
        }
      }
    }
    return null;
  };

  const currentWordPosition = getCurrentWordIndex();

  // Update volume
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Update playback speed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  return (
    <div 
      className="h-screen flex flex-col bg-[#1a1a1a] text-white overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,audio/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center">
          <div className="text-center">
            <Upload className="w-16 h-16 mx-auto mb-4 text-[#7c3aed]" />
            <p className="text-xl font-medium">Drop your file here</p>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="h-12 bg-[#1a1a1a] border-b border-[#2a2a2a] flex items-center px-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Link href="/" className="p-1.5 hover:bg-[#2a2a2a] rounded transition">
            <ArrowLeft className="w-4 h-4 text-gray-400" />
          </Link>
          <button className="p-1.5 hover:bg-[#2a2a2a] rounded transition">
            <Menu className="w-4 h-4 text-gray-400" />
          </button>
          <div className="h-4 w-px bg-[#2a2a2a] mx-1" />
          <button className="flex items-center gap-1 px-2 py-1 text-sm text-gray-400 hover:bg-[#2a2a2a] rounded transition">
            View
            <ChevronDown className="w-3 h-3" />
          </button>
          <div className="h-4 w-px bg-[#2a2a2a] mx-1" />
          <button className="p-1.5 hover:bg-[#2a2a2a] rounded transition text-gray-400">
            <Undo2 className="w-4 h-4" />
          </button>
          <button className="p-1.5 hover:bg-[#2a2a2a] rounded transition text-gray-400">
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        {/* Center - Project Title */}
        <div className="flex-1 flex justify-center">
          {isEditingTitle ? (
            <input
              type="text"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
              className="bg-transparent text-sm text-center border-b border-[#7c3aed] outline-none px-2"
              autoFocus
            />
          ) : (
            <button 
              onClick={() => setIsEditingTitle(true)}
              className="text-sm text-gray-300 hover:text-white transition flex items-center gap-1"
            >
              {projectTitle}
              <Edit3 className="w-3 h-3 text-gray-500" />
            </button>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          <button className="p-1.5 hover:bg-[#2a2a2a] rounded transition text-gray-400">
            <Share2 className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setShowExportModal(true)}
            className="bg-[#7c3aed] hover:bg-[#6d28d9] px-3 py-1.5 rounded text-sm font-medium transition"
          >
            Export
          </button>
        </div>
      </header>

      {/* Warning Banner - like Descript */}
      {transcript && (
        <div className="h-8 bg-[#f59e0b]/20 border-b border-[#f59e0b]/30 flex items-center justify-center px-4 text-xs text-[#f59e0b]">
          <AlertCircle className="w-3 h-3 mr-2" />
          Script editing support is limited for languages in this project. Results may vary.
          <button className="ml-2 underline hover:no-underline">Learn more</button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Script */}
        <aside className="w-80 bg-[#1e1e1e] border-r border-[#2a2a2a] flex flex-col flex-shrink-0">
          {/* Script Header */}
          <div className="p-3 border-b border-[#2a2a2a]">
            <div className="flex items-center justify-between mb-3">
              <button className="flex items-center gap-1 px-2 py-1 text-sm text-gray-400 hover:bg-[#2a2a2a] rounded transition">
                <Edit3 className="w-3 h-3" />
                Write
              </button>
              <button className="p-1.5 hover:bg-[#2a2a2a] rounded transition text-gray-400">
                <Copy className="w-4 h-4" />
              </button>
            </div>
            
            {/* Project Title in Script */}
            <h2 className="text-lg font-semibold text-white mb-3">{projectTitle}</h2>
            
            {/* Add Speaker Button */}
            <button className="flex items-center gap-2 px-3 py-2 text-sm text-[#7c3aed] hover:bg-[#7c3aed]/10 rounded-lg transition w-full">
              <User className="w-4 h-4" />
              Add speaker
            </button>
          </div>

          {/* Processing Status (T021 - with retry support) */}
          {showProcessingPanel && (
            <div className="p-4 border-b border-[#2a2a2a] bg-[#252525]">
              <div className="text-sm text-gray-300 mb-3 font-medium">
                {processingStatus.upload === 'error' || processingStatus.transcription === 'error' 
                  ? 'Processing failed'
                  : 'Processing...'}
              </div>
              
              <div className="space-y-2">
                <ProcessingStep 
                  label="Upload" 
                  status={processingStatus.upload} 
                  progress={processingStatus.uploadProgress}
                  error={uploadError || undefined}
                  onRetry={processingStatus.upload === 'error' ? handleRetryUpload : undefined}
                />
                <ProcessingStep 
                  label="Audio Extract" 
                  status={processingStatus.audioExtract}
                />
                <ProcessingStep 
                  label="Transcription" 
                  status={processingStatus.transcription} 
                  progress={processingStatus.transcriptionProgress}
                  error={transcriptionError || transcriptionStatus?.error}
                  onRetry={processingStatus.transcription === 'error' ? handleRetryTranscription : undefined}
                />
              </div>
            </div>
          )}

          {/* Script Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {transcriptionStatus?.status === 'processing' && !transcript && (
              <div className="flex items-center justify-center h-32">
                <div className="text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[#7c3aed]" />
                  <p className="text-sm text-gray-400">Transcribing audio...</p>
                </div>
              </div>
            )}

            {transcript?.segments && transcript.segments.length > 0 && (
              <div className="text-sm leading-relaxed">
                {transcript.segments.map((segment, segmentIndex) => (
                  <p key={segmentIndex} className="mb-4">
                    {segment.words ? (
                      segment.words.map((word, wordIndex) => {
                        const isCurrentWord = 
                          currentWordPosition && 
                          currentWordPosition.segmentIndex === segmentIndex && 
                          currentWordPosition.wordIndex === wordIndex;
                        
                        return (
                          <span
                            key={wordIndex}
                            onClick={() => seekTo(word.startTime)}
                            className={`cursor-pointer transition-all duration-100 ${
                              isCurrentWord 
                                ? 'bg-[#3b82f6] text-white px-0.5 rounded' 
                                : 'hover:bg-[#2a2a2a] text-gray-300'
                            }`}
                          >
                            {word.text}{' '}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-gray-300">{segment.text}</span>
                    )}
                  </p>
                ))}
              </div>
            )}

            {!transcript && !transcriptionStatus?.status && !showProcessingPanel && (
              <div className="text-center text-gray-500 mt-8">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Your transcript will appear here</p>
              </div>
            )}
          </div>
        </aside>

        {/* Center - Video Canvas */}
        <main className="flex-1 flex flex-col bg-[#121212] overflow-hidden">
          {/* Canvas Area */}
          <div className="flex-1 flex items-center justify-center p-6">
            {videoUrl ? (
              <div className="relative bg-black rounded-lg overflow-hidden shadow-2xl" style={{ maxHeight: '60vh', aspectRatio: '16/9' }}>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-contain"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={() => setIsPlaying(false)}
                />
              </div>
            ) : showProcessingPanel || pendingFile || isWaitingForFile ? (
              /* 正在处理中或等待文件，显示加载状态而不是上传区域 */
              <div className="w-full max-w-xl mx-auto">
                <div className="border-2 border-[#3a3a3a] rounded-2xl p-12 text-center bg-[#1a1a1a]">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#7c3aed]/20 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-[#7c3aed] animate-spin" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Processing your file...
                  </h3>
                  <p className="text-gray-400 text-sm">
                    Please wait while we prepare your video
                  </p>
                </div>
              </div>
            ) : (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full max-w-xl mx-auto cursor-pointer group"
              >
                <div className="border-2 border-dashed border-[#3a3a3a] hover:border-[#7c3aed] rounded-2xl p-12 text-center transition-all duration-300 group-hover:bg-[#7c3aed]/5">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#2a2a2a] group-hover:bg-[#7c3aed]/20 flex items-center justify-center transition">
                    <Upload className="w-8 h-8 text-gray-500 group-hover:text-[#7c3aed]" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Upload a video to get started
                  </h3>
                  <p className="text-gray-400 text-sm mb-4">
                    Drag and drop or click to browse
                  </p>
                  <button className="bg-[#7c3aed] hover:bg-[#6d28d9] text-white px-6 py-2 rounded-lg text-sm font-medium transition">
                    Choose File
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Canvas Mode Toggle - Layout / Background */}
          {videoUrl && (
            <div className="flex justify-center pb-4">
              <div className="inline-flex bg-[#2a2a2a] rounded-lg p-1">
                <button
                  onClick={() => setCanvasMode('layout')}
                  className={`px-4 py-1.5 text-sm rounded-md transition ${
                    canvasMode === 'layout' 
                      ? 'bg-[#3a3a3a] text-white' 
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Grid3X3 className="w-4 h-4 inline mr-1" />
                  Layout
                </button>
                <button
                  onClick={() => setCanvasMode('background')}
                  className={`px-4 py-1.5 text-sm rounded-md transition ${
                    canvasMode === 'background' 
                      ? 'bg-[#3a3a3a] text-white' 
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Palette className="w-4 h-4 inline mr-1" />
                  Background
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Right Panel - Underlord */}
        <aside className="w-80 bg-[#1e1e1e] border-l border-[#2a2a2a] flex flex-col flex-shrink-0">
          {/* Tab Navigation */}
          <div className="flex border-b border-[#2a2a2a] overflow-x-auto">
            {[
              { id: 'project', icon: Home, label: 'Project' },
              { id: 'ai-tools', icon: Wand2, label: 'AI Tools' },
              { id: 'properties', icon: Settings, label: 'Properties' },
              { id: 'elements', icon: Layers, label: 'Elements' },
              { id: 'captions', icon: MessageSquare, label: 'Captions' },
              { id: 'media', icon: Image, label: 'Media' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setRightPanel(tab.id as any)}
                className={`p-3 transition flex-shrink-0 ${
                  rightPanel === tab.id 
                    ? 'text-[#7c3aed] border-b-2 border-[#7c3aed]' 
                    : 'text-gray-500 hover:text-gray-300'
                }`}
                title={tab.label}
              >
                <tab.icon className="w-4 h-4" />
              </button>
            ))}
          </div>

          {/* Underlord Panel Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {rightPanel === 'underlord' || rightPanel === 'ai-tools' ? (
              <UnderlordPanel />
            ) : rightPanel === 'properties' ? (
              <PropertiesPanel />
            ) : rightPanel === 'elements' ? (
              <ElementsPanel />
            ) : rightPanel === 'media' ? (
              <MediaPanel />
            ) : (
              <div className="text-center text-gray-500 mt-8">
                <p className="text-sm">Panel content</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Bottom Timeline - Descript Style */}
      <div 
        className="bg-gradient-to-b from-[#2d1f3d] to-[#1e1e2e] border-t border-[#3d2d4d] flex flex-col flex-shrink-0"
        style={{ 
          height: `${Math.min(Math.max(200, 160 + customTracks.length * 48), 400)}px` 
        }}
      >
        {/* Transport Controls - Descript Style */}
        <div className="h-11 border-b border-[#3d2d4d]/50 flex items-center px-3 gap-2">
          {/* Add Track Button */}
          <div className="relative">
            <button 
              className="p-1.5 hover:bg-white/10 rounded transition" 
              title="Add Track"
              onClick={() => setShowAddTrackMenu(!showAddTrackMenu)}
            >
              <Plus className="w-4 h-4 text-gray-400" />
            </button>
            
            {/* Add Track Menu */}
            {showAddTrackMenu && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-[#2a2a3a] border border-[#4d3d5d] rounded-lg shadow-xl z-50 py-1">
                <button
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/10 flex items-center gap-2"
                  onClick={() => {
                    const newTrack = {
                      id: `track-video-${Date.now()}`,
                      name: `Video ${customTracks.filter(t => t.type === 'video').length + 2}`,
                      type: 'video' as const,
                    };
                    setCustomTracks([...customTracks, newTrack]);
                    setShowAddTrackMenu(false);
                  }}
                >
                  <Video className="w-4 h-4 text-purple-400" />
                  Video Track
                </button>
                <button
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/10 flex items-center gap-2"
                  onClick={() => {
                    const newTrack = {
                      id: `track-audio-${Date.now()}`,
                      name: `Audio ${customTracks.filter(t => t.type === 'audio').length + 2}`,
                      type: 'audio' as const,
                    };
                    setCustomTracks([...customTracks, newTrack]);
                    setShowAddTrackMenu(false);
                  }}
                >
                  <Music className="w-4 h-4 text-cyan-400" />
                  Audio Track
                </button>
                <button
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/10 flex items-center gap-2"
                  onClick={() => {
                    const newTrack = {
                      id: `track-text-${Date.now()}`,
                      name: `Text ${customTracks.filter(t => t.type === 'text').length + 2}`,
                      type: 'text' as const,
                    };
                    setCustomTracks([...customTracks, newTrack]);
                    setShowAddTrackMenu(false);
                  }}
                >
                  <Type className="w-4 h-4 text-blue-400" />
                  Text Track
                </button>
                <button
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/10 flex items-center gap-2"
                  onClick={() => {
                    const newTrack = {
                      id: `track-image-${Date.now()}`,
                      name: `Image ${customTracks.filter(t => t.type === 'image').length + 1}`,
                      type: 'image' as const,
                    };
                    setCustomTracks([...customTracks, newTrack]);
                    setShowAddTrackMenu(false);
                  }}
                >
                  <Image className="w-4 h-4 text-green-400" />
                  Image Track
                </button>
              </div>
            )}
          </div>

          <div className="h-5 w-px bg-[#4d3d5d]" />

          {/* Navigation */}
          <div className="flex items-center gap-0.5">
            <button 
              onClick={skipBackward}
              className="p-1.5 hover:bg-white/10 rounded transition text-gray-300"
              title="Previous"
            >
              <ChevronLeft className="w-4 h-4" /><ChevronLeft className="w-4 h-4 -ml-3" />
            </button>
            <button 
              onClick={skipForward}
              className="p-1.5 hover:bg-white/10 rounded transition text-gray-300"
              title="Next"
            >
              <ChevronRight className="w-4 h-4" /><ChevronRight className="w-4 h-4 -ml-3" />
            </button>
          </div>

          {/* Time Display - Descript Style */}
          <div className="text-sm font-mono bg-[#1a1a2a] px-2 py-0.5 rounded">
            <span className="text-white">{formatTimeCode(currentTime)}</span>
          </div>

          <div className="h-5 w-px bg-[#4d3d5d]" />

          {/* Record Button */}
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-full transition text-white text-sm font-medium">
            <div className="w-2 h-2 rounded-full bg-white" />
            Record
          </button>

          <div className="h-5 w-px bg-[#4d3d5d]" />

          {/* Play Button */}
          <button 
            onClick={togglePlay}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition"
          >
            {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white" fill="white" />}
          </button>

          {/* Speed Control */}
          <button 
            className="px-2 py-1 text-sm text-gray-300 hover:bg-white/10 rounded transition font-medium"
            onClick={() => {
              const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
              const currentIndex = speeds.indexOf(playbackSpeed);
              const nextIndex = (currentIndex + 1) % speeds.length;
              setPlaybackSpeed(speeds[nextIndex]);
            }}
          >
            {playbackSpeed}x
          </button>

          <div className="h-5 w-px bg-[#4d3d5d]" />

          {/* Split Button */}
          <div className="relative group">
            <button 
              className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-300 hover:bg-white/10 rounded transition"
              onClick={handleSplit}
              title="Split scene (S)"
            >
              <Scissors className="w-4 h-4" />
              Split
            </button>
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-lg">
              <div className="font-medium">Split scene</div>
              <div className="text-gray-400">S</div>
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
            </div>
          </div>

          <div className="flex-1" />

          {/* Duration Display */}
          <span className="text-xs text-gray-400">{formatTimeCode(duration)}</span>

          <div className="h-5 w-px bg-[#4d3d5d]" />

          {/* Zoom Controls */}
          <div className="flex items-center gap-1">
            <button className="p-1 hover:bg-white/10 rounded transition">
              <ZoomOut className="w-4 h-4 text-gray-400" />
            </button>
            <div className="w-16 h-1 bg-[#4d3d5d] rounded-full overflow-hidden">
              <div className="w-1/2 h-full bg-purple-400 rounded-full" />
            </div>
            <button className="p-1 hover:bg-white/10 rounded transition">
              <ZoomIn className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Timeline Tracks */}
        <div className="flex-1 overflow-auto">
          <EnhancedTimeline 
            duration={duration} 
            currentTime={currentTime}
            transcript={transcript}
            videoUrl={videoUrl}
            customTracks={customTracks}
            videoClips={videoClips}
            selectedClipId={selectedClipId}
            onSelectClip={setSelectedClipId}
            onDeleteClip={handleDeleteClip}
            onRemoveTrack={(id) => setCustomTracks(customTracks.filter(t => t.id !== id))}
            onSeek={(time) => {
              if (videoRef.current) {
                videoRef.current.currentTime = time;
                setCurrentTime(time);
              }
            }}
          />
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && <ExportModal onClose={() => setShowExportModal(false)} />}
    </div>
  );
}

// Processing Step Component with retry support (T021)
function ProcessingStep({ 
  label, 
  status, 
  progress, 
  error,
  onRetry 
}: { 
  label: string; 
  status: string; 
  progress?: number;
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {status === 'processing' && <Loader2 className="w-3 h-3 text-[#7c3aed] animate-spin" />}
      {status === 'completed' && <CheckCircle className="w-3 h-3 text-green-500" />}
      {status === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
      {status === 'idle' && <div className="w-3 h-3 rounded-full border border-gray-600" />}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs ${status === 'error' ? 'text-red-400' : 'text-gray-400'}`}>{label}</span>
          {status === 'processing' && progress !== undefined && (
            <span className="text-xs text-gray-500">{progress}%</span>
          )}
        </div>
        {status === 'error' && error && (
          <p className="text-xs text-red-400/80 mt-0.5">{error}</p>
        )}
      </div>
      {status === 'error' && onRetry && (
        <button 
          onClick={onRetry}
          className="text-xs text-[#7c3aed] hover:text-[#6d28d9] font-medium"
        >
          Retry
        </button>
      )}
    </div>
  );
}

// Underlord Panel Component
function UnderlordPanel() {
  const [prompt, setPrompt] = useState('');

  const suggestions = [
    { icon: Sparkles, label: 'Remove filler words', desc: 'um, uh, like...' },
    { icon: Wand2, label: 'Studio Sound', desc: 'Enhance audio' },
    { icon: MessageSquare, label: 'Add captions', desc: 'Auto-generate' },
    { icon: Scissors, label: 'Remove silences', desc: 'Clean up gaps' },
  ];

  return (
    <div className="space-y-4">
      {/* Header with Icon */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Underlord</h3>
          <p className="text-xs text-gray-500">AI Assistant</p>
        </div>
      </div>

      {/* Input */}
      <div className="relative">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Tell Underlord what you want to make"
          className="w-full bg-[#2a2a2a] border border-[#3a3a3a] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#7c3aed] transition"
        />
      </div>

      {/* Browse Templates */}
      <button className="w-full py-2 text-sm text-[#7c3aed] hover:bg-[#7c3aed]/10 rounded-lg transition flex items-center justify-center gap-1">
        <Layers className="w-4 h-4" />
        Browse templates
      </button>

      {/* Divider */}
      <div className="h-px bg-[#2a2a2a]" />

      {/* Suggestions */}
      <div className="space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wide">Suggestions</p>
        {suggestions.map((suggestion, i) => (
          <button
            key={i}
            className="w-full flex items-center gap-3 p-2 hover:bg-[#2a2a2a] rounded-lg transition text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-[#2a2a2a] flex items-center justify-center flex-shrink-0">
              <suggestion.icon className="w-4 h-4 text-[#7c3aed]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{suggestion.label}</p>
              <p className="text-xs text-gray-500 truncate">{suggestion.desc}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>
        ))}
      </div>
    </div>
  );
}

// Properties Panel
function PropertiesPanel() {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Properties</h3>
      <p className="text-sm text-gray-500">Select an element to edit its properties</p>
    </div>
  );
}

// Elements Panel
function ElementsPanel() {
  const elements = [
    { icon: Type, label: 'Text' },
    { icon: Image, label: 'Image' },
    { icon: Shapes, label: 'Shape' },
    { icon: Video, label: 'Video' },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Elements</h3>
      <div className="grid grid-cols-2 gap-2">
        {elements.map((el, i) => (
          <button
            key={i}
            className="flex flex-col items-center gap-2 p-4 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded-lg transition"
          >
            <el.icon className="w-6 h-6 text-gray-400" />
            <span className="text-xs text-gray-400">{el.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Shapes icon component (not in lucide by default)
function Shapes(props: any) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <circle cx="17" cy="7" r="4" />
      <polygon points="8 14 3 21 13 21" />
    </svg>
  );
}

// Media Panel
function MediaPanel() {
  const { mediaFiles } = useEditorStore();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Media</h3>
        <button className="p-1.5 hover:bg-[#2a2a2a] rounded transition">
          <Plus className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      
      {mediaFiles.length > 0 ? (
        <div className="space-y-2">
          {mediaFiles.map((file) => (
            <div key={file.id} className="flex items-center gap-2 p-2 bg-[#2a2a2a] rounded-lg">
              <div className="w-12 h-8 bg-[#3a3a3a] rounded flex items-center justify-center">
                {file.type === 'video' ? <Video className="w-4 h-4 text-gray-500" /> : <Music className="w-4 h-4 text-gray-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white truncate">{file.name}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No media files</p>
      )}
    </div>
  );
}

// Enhanced Timeline with thumbnails, text, and waveform
function EnhancedTimeline({ duration, currentTime, transcript, videoUrl, customTracks, videoClips, selectedClipId, onSelectClip, onDeleteClip, onRemoveTrack, onSeek }: { 
  duration: number; 
  currentTime: number;
  transcript: any;
  videoUrl: string | null;
  customTracks: Array<{id: string; name: string; type: 'video' | 'audio' | 'text' | 'image'}>;
  videoClips: Array<{id: string; startTime: number; endTime: number; isDeleted: boolean}>;
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
  onDeleteClip: (id: string) => void;
  onRemoveTrack: (id: string) => void;
  onSeek: (time: number) => void;
}) {
  const { mediaFiles } = useEditorStore();
  const timelineRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);

  // Descript-style time code format
  const formatTimeCode = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [generatedForUrl, setGeneratedForUrl] = useState<string | null>(null);
  const pixelsPerSecond = 30 * zoom;
  const totalWidth = Math.max(duration * pixelsPerSecond, 800);
  const thumbnailInterval = 1; // Generate 1 thumbnail per second for clearer display

  // Get current media ID and extract filename from URL
  const currentMediaId = mediaFiles.length > 0 ? mediaFiles[mediaFiles.length - 1].id : null;
  
  // Extract filename from video URL as fallback - only works with server URLs, not blob URLs
  const getFilenameFromUrl = (url: string | null): string | null => {
    if (!url) return null;
    // Skip blob URLs
    if (url.startsWith('blob:')) return null;
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const parts = pathname.split('/');
      return parts[parts.length - 1];
    } catch {
      return null;
    }
  };

  // Generate thumbnails using backend API
  useEffect(() => {
    console.log('EnhancedTimeline useEffect triggered:', { videoUrl, isGeneratingThumbnails, generatedForUrl, thumbnailsLength: thumbnails.length });
    
    if (!videoUrl) {
      console.log('No videoUrl, skipping thumbnail generation');
      return;
    }
    
    // Skip blob URLs - wait for server URL
    if (videoUrl.startsWith('blob:')) {
      console.log('Skipping blob URL, waiting for server URL');
      return;
    }
    
    if (isGeneratingThumbnails) {
      console.log('Already generating thumbnails, skipping');
      return;
    }
    if (generatedForUrl === videoUrl && thumbnails.length > 0) {
      console.log('Thumbnails already generated for this URL');
      return;
    }
    
    const generateThumbnails = async () => {
      setIsGeneratingThumbnails(true);
      setThumbnailError(false);
      
      const mediaId = currentMediaId || 'unknown';
      const videoFilename = getFilenameFromUrl(videoUrl);
      
      console.log('Requesting thumbnails from backend:', { mediaId, videoUrl, videoFilename });
      
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/media/${mediaId}/generate-thumbnails`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            interval: thumbnailInterval,
            videoFilename: videoFilename,
          }),
        });
        
        const data = await response.json();
        
        if (data.success && data.data.thumbnails) {
          console.log('Received', data.data.thumbnails.length, 'thumbnails from backend');
          setThumbnails(data.data.thumbnails);
          setGeneratedForUrl(videoUrl);
        } else {
          console.error('Failed to generate thumbnails:', data.error);
          setThumbnailError(true);
        }
      } catch (error) {
        console.error('Error fetching thumbnails:', error);
        setThumbnailError(true);
      } finally {
        setIsGeneratingThumbnails(false);
      }
    };
    
    generateThumbnails();
  }, [videoUrl]);

  const handleClick = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const scrollLeft = timelineRef.current.scrollLeft;
    const x = e.clientX - rect.left + scrollLeft;
    const time = Math.max(0, Math.min(x / pixelsPerSecond, duration));
    onSeek(time);
  };

  return (
    <div className="flex flex-col min-h-full">
      {/* Track Labels - Descript Style */}
      <div className="flex">
        <div className="w-28 flex-shrink-0 bg-[#1a1525] border-r border-[#3d2d4d]/50">
          <div className="h-6 border-b border-[#3d2d4d]/50" />
          <div className="h-16 px-3 flex items-center justify-between border-b border-[#3d2d4d]/30 group">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-purple-500/30 flex items-center justify-center">
                <Video className="w-3 h-3 text-purple-300" />
              </div>
              <span className="text-xs text-gray-300 font-medium">Scene</span>
            </div>
            <MoreHorizontal className="w-4 h-4 text-gray-500 opacity-0 group-hover:opacity-100 transition" />
          </div>
          <div className="h-10 px-3 flex items-center justify-between border-b border-[#3d2d4d]/30 group">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-blue-500/30 flex items-center justify-center">
                <Type className="w-3 h-3 text-blue-300" />
              </div>
              <span className="text-xs text-gray-300 font-medium">Text</span>
            </div>
            <MoreHorizontal className="w-4 h-4 text-gray-500 opacity-0 group-hover:opacity-100 transition" />
          </div>
          <div className="h-14 px-3 flex items-center justify-between group border-b border-[#3d2d4d]/30">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-cyan-500/30 flex items-center justify-center">
                <Music className="w-3 h-3 text-cyan-300" />
              </div>
              <span className="text-xs text-gray-300 font-medium">Audio</span>
            </div>
            <MoreHorizontal className="w-4 h-4 text-gray-500 opacity-0 group-hover:opacity-100 transition" />
          </div>
          
          {/* Custom Tracks Labels */}
          {customTracks.map((track) => (
            <div key={track.id} className="h-12 px-3 flex items-center justify-between group border-b border-[#3d2d4d]/30">
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded flex items-center justify-center ${
                  track.type === 'video' ? 'bg-purple-500/30' :
                  track.type === 'audio' ? 'bg-cyan-500/30' :
                  track.type === 'text' ? 'bg-blue-500/30' :
                  'bg-green-500/30'
                }`}>
                  {track.type === 'video' && <Video className="w-3 h-3 text-purple-300" />}
                  {track.type === 'audio' && <Music className="w-3 h-3 text-cyan-300" />}
                  {track.type === 'text' && <Type className="w-3 h-3 text-blue-300" />}
                  {track.type === 'image' && <Image className="w-3 h-3 text-green-300" />}
                </div>
                <span className="text-xs text-gray-300 font-medium">{track.name}</span>
              </div>
              <button 
                onClick={() => onRemoveTrack(track.id)}
                className="p-1 hover:bg-white/10 rounded opacity-0 group-hover:opacity-100 transition"
                title="Remove Track"
              >
                <X className="w-3 h-3 text-gray-500 hover:text-red-400" />
              </button>
            </div>
          ))}
        </div>

        {/* Timeline Content - Descript Style */}
        <div 
          ref={timelineRef}
          className="flex-1 overflow-x-auto overflow-y-hidden cursor-pointer bg-[#1e1830]"
          onClick={handleClick}
        >
          <div style={{ width: totalWidth }} className="relative h-full">
            {/* Time Ruler - Descript Style */}
            <div className="h-6 border-b border-[#3d2d4d]/30 bg-[#1a1525] relative">
              {Array.from({ length: Math.ceil(duration) + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full flex items-center"
                  style={{ left: i * pixelsPerSecond }}
                >
                  <div className="h-2 w-px bg-[#4d3d5d]" />
                  <span className="text-[10px] text-gray-500 ml-1 font-mono">
                    {formatTimeCode(i)}
                  </span>
                </div>
              ))}
            </div>

            {/* Video Track with Split Clips */}
            <div className="h-16 border-b border-[#3d2d4d]/30 relative bg-[#1e1830]">
              {/* Render each video clip separately */}
              {videoClips.filter(clip => !clip.isDeleted).map((clip, clipIndex) => {
                const clipWidth = (clip.endTime - clip.startTime) * pixelsPerSecond;
                const clipLeft = clip.startTime * pixelsPerSecond;
                const isSelected = selectedClipId === clip.id;
                
                // Calculate which thumbnails belong to this clip
                const startThumbnailIndex = Math.floor(clip.startTime / thumbnailInterval);
                const endThumbnailIndex = Math.ceil(clip.endTime / thumbnailInterval);
                const clipThumbnails = thumbnails.slice(startThumbnailIndex, endThumbnailIndex);
                
                return (
                  <div 
                    key={clip.id}
                    className={`absolute top-1 bottom-1 rounded-sm overflow-hidden shadow-lg cursor-pointer transition-all ${
                      isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-[#1e1830]' : ''
                    }`}
                    style={{ 
                      left: clipLeft, 
                      width: clipWidth,
                      marginRight: '2px'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectClip(isSelected ? null : clip.id);
                    }}
                  >
                    <div className={`h-full flex border-l-2 ${isSelected ? 'border-white bg-purple-700/50' : 'border-purple-400 bg-gradient-to-b from-purple-800/40 to-purple-900/40'}`}>
                      {clipThumbnails.length > 0 ? (
                        clipThumbnails.map((thumb, i) => (
                          <div 
                            key={i} 
                            className="h-full flex-shrink-0 border-r border-purple-900/30"
                            style={{ width: thumbnailInterval * pixelsPerSecond }}
                          >
                            <img 
                              src={thumb} 
                              alt={`Frame ${startThumbnailIndex + i}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))
                      ) : (
                        // Placeholder while generating thumbnails
                        <div className="h-full w-full bg-purple-800/30 flex items-center justify-center">
                          {isGeneratingThumbnails && clipIndex === 0 && (
                            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Clip selection indicator & delete button */}
                    {isSelected && (
                      <div className="absolute top-0 right-0 p-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteClip(clip.id);
                          }}
                          className="p-1 bg-red-500 hover:bg-red-600 rounded text-white transition"
                          title="Delete clip"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              
              {/* Split indicators (vertical lines between clips) */}
              {videoClips.filter(clip => !clip.isDeleted).slice(0, -1).map((clip, index) => (
                <div
                  key={`split-${clip.id}`}
                  className="absolute top-0 bottom-0 w-0.5 bg-yellow-400/80 z-10"
                  style={{ left: clip.endTime * pixelsPerSecond - 1 }}
                  title={`Split at ${formatTimeCode(clip.endTime)}`}
                />
              ))}
            </div>

            {/* Text Track with Words - Descript Style */}
            <div className="h-10 border-b border-[#3d2d4d]/30 relative bg-[#1e1830]">
              {transcript?.segments?.map((segment: any, segIdx: number) => (
                segment.words?.map((word: any, wordIdx: number) => (
                  <div
                    key={`${segIdx}-${wordIdx}`}
                    className="absolute top-1 bottom-1 bg-gradient-to-b from-blue-700/50 to-blue-800/50 border-l-2 border-blue-400 rounded-sm flex items-center px-1.5 overflow-hidden hover:from-blue-600/50 hover:to-blue-700/50 transition cursor-pointer"
                    style={{
                      left: word.startTime * pixelsPerSecond,
                      width: Math.max((word.endTime - word.startTime) * pixelsPerSecond, 25),
                    }}
                  >
                    <span className="text-[9px] text-blue-200 truncate font-medium">{word.text.trim()}</span>
                  </div>
                ))
              ))}
            </div>

            {/* Audio Waveform Track - Descript Style */}
            <div className="h-14 relative bg-[#1e1830] border-b border-[#3d2d4d]/30">
              <div 
                className="absolute top-1 bottom-1 rounded-sm overflow-hidden shadow-lg"
                style={{ left: 0, width: duration * pixelsPerSecond || 200 }}
              >
                <div className="h-full bg-gradient-to-b from-cyan-800/30 to-cyan-900/30 border-l-2 border-cyan-400 flex items-center">
                  {/* Waveform visualization */}
                  <svg className="w-full h-full" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="waveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="rgba(34, 211, 238, 0.6)" />
                        <stop offset="50%" stopColor="rgba(34, 211, 238, 0.3)" />
                        <stop offset="100%" stopColor="rgba(34, 211, 238, 0.6)" />
                      </linearGradient>
                    </defs>
                    <path
                      d={generateWaveformPath(totalWidth, 48)}
                      fill="none"
                      stroke="url(#waveGradient)"
                      strokeWidth="1.5"
                    />
                  </svg>
                </div>
              </div>
            </div>

            {/* Custom Tracks Content */}
            {customTracks.map((track) => (
              <div key={track.id} className="h-12 relative bg-[#1e1830] border-b border-[#3d2d4d]/30">
                <div 
                  className={`absolute top-1 bottom-1 rounded-sm overflow-hidden shadow-lg border-l-2 ${
                    track.type === 'video' ? 'bg-gradient-to-b from-purple-800/30 to-purple-900/30 border-purple-400' :
                    track.type === 'audio' ? 'bg-gradient-to-b from-cyan-800/30 to-cyan-900/30 border-cyan-400' :
                    track.type === 'text' ? 'bg-gradient-to-b from-blue-800/30 to-blue-900/30 border-blue-400' :
                    'bg-gradient-to-b from-green-800/30 to-green-900/30 border-green-400'
                  }`}
                  style={{ left: 0, width: duration * pixelsPerSecond || 200 }}
                >
                  <div className="h-full flex items-center px-2">
                    <span className="text-[10px] text-gray-400 italic">
                      Drag media here or double-click to add content
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {/* Playhead - Descript Style */}
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-white z-30 pointer-events-none shadow-lg"
              style={{ left: currentTime * pixelsPerSecond }}
            >
              <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow-md" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Generate fake waveform path
function generateWaveformPath(width: number, height: number): string {
  const points: string[] = [];
  const centerY = height / 2;
  const step = 3;
  
  for (let x = 0; x < width; x += step) {
    const amplitude = Math.random() * (height / 2 - 5) + 5;
    const y = centerY + (Math.random() > 0.5 ? amplitude : -amplitude) * 0.5;
    points.push(`${x === 0 ? 'M' : 'L'} ${x} ${y}`);
  }
  
  return points.join(' ');
}

// Export Modal Component
function ExportModal({ onClose }: { onClose: () => void }) {
  const [exportFormat, setExportFormat] = useState('mp4');
  const [quality, setQuality] = useState('1080p');

  const formats = [
    { id: 'mp4', name: 'MP4', desc: 'Best for sharing' },
    { id: 'mov', name: 'MOV', desc: 'High quality' },
    { id: 'mp3', name: 'MP3', desc: 'Audio only' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#1e1e1e] rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Export Project</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-[#2a2a2a] rounded transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Format</label>
            <div className="grid grid-cols-3 gap-2">
              {formats.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setExportFormat(f.id)}
                  className={`p-3 rounded-lg border transition ${
                    exportFormat === f.id
                      ? 'border-[#7c3aed] bg-[#7c3aed]/10'
                      : 'border-[#2a2a2a] hover:border-[#3a3a3a]'
                  }`}
                >
                  <p className="text-sm font-medium">{f.name}</p>
                  <p className="text-xs text-gray-500">{f.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-2 block">Quality</label>
            <select 
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              className="w-full bg-[#2a2a2a] border border-[#3a3a3a] rounded-lg px-3 py-2 text-sm outline-none"
            >
              <option value="4k">4K (3840 × 2160)</option>
              <option value="1080p">1080p (1920 × 1080)</option>
              <option value="720p">720p (1280 × 720)</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded-lg transition"
          >
            Cancel
          </button>
          <button className="flex-1 px-4 py-2 bg-[#7c3aed] hover:bg-[#6d28d9] rounded-lg transition">
            Export
          </button>
        </div>
      </div>
    </div>
  );
}

export default DescriptEditor;

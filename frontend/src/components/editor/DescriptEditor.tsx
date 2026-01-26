'use client';

import { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '@/stores/editorStore';
import { transcriptionApi, mediaApi } from '@/lib/api';
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
  MoreHorizontal,
  Plus,
  Type,
  Image,
  Video,
  Music,
  Shapes,
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
} from 'lucide-react';

interface DescriptEditorProps {
  projectId: string;
  initialMediaId?: string;
  initialMediaUrl?: string;
  initialTranscriptionId?: string;
  pendingFile?: File | null;
}

// 处理状态类型
interface ProcessingStatus {
  upload: 'idle' | 'processing' | 'completed' | 'error';
  uploadProgress: number;
  audioExtract: 'idle' | 'processing' | 'completed' | 'error';
  transcription: 'idle' | 'processing' | 'completed' | 'error';
  transcriptionProgress: number;
}

export function DescriptEditor({ projectId, initialMediaId, initialMediaUrl, initialTranscriptionId, pendingFile }: DescriptEditorProps) {
  const [leftPanel, setLeftPanel] = useState<'script' | 'scenes' | 'media'>('script');
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showUnderlord, setShowUnderlord] = useState(false);
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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
  } = useEditorStore();

  // Handle user-initiated seeks (e.g., clicking on transcript words)
  useEffect(() => {
    // Subscribe to seekVersion changes
    const unsubscribe = useEditorStore.subscribe(
      (state, prevState) => {
        if (state.seekVersion !== prevState.seekVersion && state.seekVersion > 0) {
          if (videoRef.current) {
            console.log('Seeking video to:', state.currentTime);
            videoRef.current.currentTime = state.currentTime;
          }
        }
      }
    );
    return () => unsubscribe();
  }, []);

  // Handle pending file from homepage - process upload, audio extraction and transcription
  useEffect(() => {
    if (pendingFile) {
      console.log('Processing pending file from homepage:', pendingFile.name);
      setShowProcessingPanel(true);
      processFileFromHomepage(pendingFile);
    }
  }, [pendingFile]);

  // Process file from homepage: upload -> audio extract -> transcribe
  const processFileFromHomepage = async (file: File) => {
    try {
      // Step 1: Upload
      setProcessingStatus(prev => ({ ...prev, upload: 'processing', uploadProgress: 0 }));
      
      // Create local preview URL immediately
      const localPreviewUrl = URL.createObjectURL(file);
      setVideoUrl(localPreviewUrl);
      
      // Simulate upload progress
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
      
      // Update video URL to server URL
      setVideoUrl(mediaUrl);
      URL.revokeObjectURL(localPreviewUrl);
      
      // Add to media files
      addMediaFile({
        id: mediaId,
        name: file.name,
        type: file.type.startsWith('video/') ? 'video' : 'audio',
        url: mediaUrl,
        duration: 0,
        size: file.size,
        thumbnails: [],
      });
      
      // Step 2: Start transcription (which includes audio extraction on backend)
      setProcessingStatus(prev => ({ ...prev, audioExtract: 'completed', transcription: 'processing' }));
      
      const transcriptionResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/transcriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId, mediaUrl }),
      });
      
      const transcriptionData = await transcriptionResponse.json();
      const transcriptionId = transcriptionData.data.id;
      
      setTranscriptionStatus({ id: transcriptionId, status: 'processing', progress: 0 });
      
      // Poll for transcription status
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

  // Poll transcription with progress updates
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
          
          // Set transcript data
          setTranscript({
            id: transcriptionId,
            mediaId: data.mediaId || '',
            language: data.language || 'en',
            segments: data.segments || [],
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          });
          
          // Hide processing panel after a delay
          setTimeout(() => setShowProcessingPanel(false), 2000);
        } else if (data.status === 'error') {
          clearInterval(pollInterval);
          setProcessingStatus(prev => ({ ...prev, transcription: 'error' }));
          setTranscriptionStatus({ id: transcriptionId, status: 'error', progress: 0, error: data.error });
        } else {
          // Update progress
          progress = Math.min(progress + 5, 95);
          setProcessingStatus(prev => ({ ...prev, transcriptionProgress: progress }));
          setTranscriptionStatus({ id: transcriptionId, status: 'processing', progress });
        }
      } catch (error) {
        console.error('Error polling transcription:', error);
      }
    }, 2000);
  };

  // Handle initial media and transcription from homepage (legacy support)
  useEffect(() => {
    if (initialMediaId && initialMediaUrl) {
      console.log('Loading initial media:', initialMediaId, initialMediaUrl);
      const decodedUrl = decodeURIComponent(initialMediaUrl);
      setVideoUrl(decodedUrl);
      
      // If we have a transcription ID from homepage, poll for its status
      if (initialTranscriptionId) {
        console.log('Loading existing transcription:', initialTranscriptionId);
        setTranscriptionStatus({ id: initialTranscriptionId, status: 'processing', progress: 50 });
        pollExistingTranscription(initialTranscriptionId);
      } else {
        // Start new transcription
        startTranscription(initialMediaId, decodedUrl);
      }
    }
  }, [initialMediaId, initialMediaUrl, initialTranscriptionId]);

  // Poll for existing transcription status (from homepage)
  const pollExistingTranscription = async (transcriptionId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const statusResponse = await transcriptionApi.getById(transcriptionId);
        const data = statusResponse.data.data;
        
        setTranscriptionStatus({ 
          id: transcriptionId, 
          status: data.status, 
          progress: data.progress 
        });
        
        if (data.status === 'completed') {
          clearInterval(pollInterval);
          // Set transcript data
          setTranscript({
            id: transcriptionId,
            mediaId: initialMediaId || '',
            language: data.language || 'en',
            segments: data.segments || [],
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          });
          setTranscriptionStatus({ id: transcriptionId, status: 'completed', progress: 100 });
        } else if (data.status === 'error') {
          clearInterval(pollInterval);
          setTranscriptionStatus({ 
            id: transcriptionId, 
            status: 'error', 
            progress: 0, 
            error: data.error 
          });
        }
      } catch (error) {
        console.error('Error polling transcription status:', error);
      }
    }, 1500);
    
    // Timeout after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
    }, 5 * 60 * 1000);
  };

  // Start transcription after upload
  const startTranscription = async (mediaId: string, mediaUrl: string) => {
    try {
      setTranscriptionStatus({ id: '', status: 'processing', progress: 0 });
      
      // Call backend to start transcription with media URL
      const response = await transcriptionApi.create(mediaId, mediaUrl);
      const transcriptionId = response.data.data.id;
      
      setTranscriptionStatus({ id: transcriptionId, status: 'processing', progress: 10 });
      
      // Poll for transcription status
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await transcriptionApi.getById(transcriptionId);
          const data = statusResponse.data.data;
          
          setTranscriptionStatus({ 
            id: transcriptionId, 
            status: data.status, 
            progress: data.progress 
          });
          
          if (data.status === 'completed') {
            clearInterval(pollInterval);
            // Set transcript data
            setTranscript({
              id: transcriptionId,
              mediaId: mediaId,
              language: data.language || 'en',
              segments: data.segments || [],
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
            });
            setTranscriptionStatus({ id: transcriptionId, status: 'completed', progress: 100 });
          } else if (data.status === 'error') {
            clearInterval(pollInterval);
            setTranscriptionStatus({ 
              id: transcriptionId, 
              status: 'error', 
              progress: 0, 
              error: data.error 
            });
          }
        } catch (error) {
          console.error('Error polling transcription status:', error);
        }
      }, 1500);
      
      // Timeout after 5 minutes for real transcription
      setTimeout(() => {
        clearInterval(pollInterval);
      }, 300000);
      
    } catch (error) {
      console.error('Error starting transcription:', error);
      setTranscriptionStatus({ id: '', status: 'error', progress: 0, error: 'Failed to start transcription' });
    }
  };

  // Handle file upload
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) {
      alert('Please upload a video or audio file');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Create FormData and upload to backend
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId);

      // Upload with progress tracking
      const { mediaApi } = await import('@/lib/api');
      const response = await mediaApi.upload(formData, {
        onUploadProgress: (progressEvent: any) => {
          const progress = progressEvent.total 
            ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
            : 0;
          setUploadProgress(Math.min(progress, 90));
        },
      });

      if (!response.data.success) {
        throw new Error(response.data.error || 'Upload failed');
      }

      const uploadedMedia = response.data.data;
      
      // Get the server URL for the uploaded file
      const { getUploadUrl } = await import('@/lib/api');
      const serverUrl = getUploadUrl(uploadedMedia.url);
      
      // Create object URL for local preview
      const localPreviewUrl = URL.createObjectURL(file);
      
      // Add to media library
      const mediaFile = {
        id: uploadedMedia.id,
        name: uploadedMedia.originalName || file.name,
        type: uploadedMedia.type as 'video' | 'audio',
        url: localPreviewUrl, // Use local URL for preview
        serverUrl: serverUrl, // Store server URL for transcription
        duration: 0,
        size: uploadedMedia.size,
        thumbnails: [],
        waveform: [],
      };
      
      addMediaFile(mediaFile);
      
      // Set as main video
      if (file.type.startsWith('video/')) {
        setVideoUrl(localPreviewUrl);
      }

      setUploadProgress(100);
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        
        // Start transcription with server URL
        startTranscription(mediaFile.id, serverUrl);
      }, 500);

    } catch (error: any) {
      console.error('Upload error:', error);
      alert(error.message || 'Failed to upload file');
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileUpload(e.dataTransfer.files);
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-screen flex flex-col bg-[#0f0f0f] text-white">
      {/* Top Header Bar */}
      <header className="h-12 bg-[#1a1a1a] border-b border-[#2a2a2a] flex items-center justify-between px-3 flex-shrink-0">
        {/* Left: Back & Project Name */}
        <div className="flex items-center gap-3">
          <Link 
            href="/"
            className="p-1.5 hover:bg-[#2a2a2a] rounded-lg transition"
          >
            <ChevronLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{projectName || 'Untitled'}</span>
            <ChevronDown className="w-4 h-4 text-gray-500" />
          </div>
        </div>

        {/* Center: Import & Tools */}
        <div className="flex items-center gap-1">
          {/* Import Button */}
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded-lg text-sm transition mr-2"
          >
            <Upload className="w-4 h-4" />
            <span>Import</span>
          </button>
          <div className="w-px h-5 bg-[#2a2a2a] mx-1" />
          <button className="p-2 hover:bg-[#2a2a2a] rounded-lg transition text-gray-400 hover:text-white">
            <Undo2 className="w-4 h-4" />
          </button>
          <button className="p-2 hover:bg-[#2a2a2a] rounded-lg transition text-gray-400 hover:text-white">
            <Redo2 className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-[#2a2a2a] mx-2" />
          <button className="p-2 hover:bg-[#2a2a2a] rounded-lg transition text-gray-400 hover:text-white">
            <Scissors className="w-4 h-4" />
          </button>
          <button className="p-2 hover:bg-[#2a2a2a] rounded-lg transition text-gray-400 hover:text-white">
            <Copy className="w-4 h-4" />
          </button>
          <button className="p-2 hover:bg-[#2a2a2a] rounded-lg transition text-gray-400 hover:text-white">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Right: AI & Export */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowUnderlord(!showUnderlord)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition ${
              showUnderlord 
                ? 'bg-[#7c3aed] text-white' 
                : 'bg-[#2a2a2a] text-gray-300 hover:bg-[#3a3a3a]'
            }`}
          >
            <Wand2 className="w-4 h-4" />
            <span>Underlord</span>
          </button>
          <button className="p-2 hover:bg-[#2a2a2a] rounded-lg transition text-gray-400 hover:text-white">
            <Share2 className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 bg-[#7c3aed] hover:bg-[#6d28d9] px-4 py-1.5 rounded-lg text-sm transition"
          >
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Script/Scenes/Media */}
        <aside className={`w-96 border-r flex flex-col flex-shrink-0 ${
          leftPanel === 'script' ? 'bg-white border-gray-200' : 'bg-[#1a1a1a] border-[#2a2a2a]'
        }`}>
          {/* Panel Tabs */}
          <div className={`flex border-b ${leftPanel === 'script' ? 'border-gray-200' : 'border-[#2a2a2a]'}`}>
            <button 
              onClick={() => setLeftPanel('script')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                leftPanel === 'script' 
                  ? 'text-gray-900 border-b-2 border-blue-500' 
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              Script
            </button>
            <button 
              onClick={() => setLeftPanel('scenes')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                leftPanel === 'scenes' 
                  ? 'text-white border-b-2 border-[#7c3aed]' 
                  : leftPanel === 'script' ? 'text-gray-500 hover:text-gray-700' : 'text-gray-500 hover:text-white'
              }`}
            >
              Scenes
            </button>
            <button 
              onClick={() => setLeftPanel('media')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                leftPanel === 'media' 
                  ? 'text-white border-b-2 border-[#7c3aed]' 
                  : leftPanel === 'script' ? 'text-gray-500 hover:text-gray-700' : 'text-gray-500 hover:text-white'
              }`}
            >
              Media
            </button>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-hidden">
            {leftPanel === 'script' && <ScriptPanel />}
            {leftPanel === 'scenes' && <ScenesPanel />}
            {leftPanel === 'media' && <MediaPanel onUpload={handleFileUpload} />}
          </div>
        </aside>

        {/* Center - Canvas/Preview */}
        <main 
          className={`flex-1 flex flex-col bg-[#0f0f0f] overflow-hidden relative ${isDragging ? 'ring-2 ring-[#7c3aed] ring-inset' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,audio/*"
            onChange={(e) => handleFileUpload(e.target.files)}
            className="hidden"
          />

          {/* Drag Overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-50 bg-[#7c3aed]/20 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-[#1a1a1a] border-2 border-dashed border-[#7c3aed] rounded-xl p-12 text-center">
                <Upload className="w-16 h-16 mx-auto mb-4 text-[#7c3aed]" />
                <p className="text-xl font-medium text-white mb-2">Drop your file here</p>
                <p className="text-gray-400">Video or audio files supported</p>
              </div>
            </div>
          )}

          {/* Upload Progress Overlay */}
          {isUploading && (
            <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-[#1a1a1a] rounded-xl p-8 text-center w-80">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#7c3aed]/20 flex items-center justify-center">
                  <Upload className="w-8 h-8 text-[#7c3aed] animate-pulse" />
                </div>
                <p className="text-lg font-medium text-white mb-4">Uploading...</p>
                <div className="h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#7c3aed] transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-sm text-gray-400 mt-2">{Math.round(uploadProgress)}%</p>
              </div>
            </div>
          )}

          {/* Canvas Area */}
          <div className="flex-1 flex items-center justify-center p-4 relative">
            {/* Processing Status Panel */}
            {showProcessingPanel && (
              <div className="absolute top-4 right-4 z-20 bg-[#2a2a2a] rounded-xl shadow-xl border border-[#3a3a3a] p-4 w-80">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-medium">处理进度</h3>
                  {processingStatus.transcription === 'completed' && (
                    <button 
                      onClick={() => setShowProcessingPanel(false)}
                      className="text-gray-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                {/* Upload Status */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {processingStatus.upload === 'processing' && <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />}
                      {processingStatus.upload === 'completed' && <CheckCircle className="w-4 h-4 text-green-500" />}
                      {processingStatus.upload === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                      {processingStatus.upload === 'idle' && <div className="w-4 h-4 rounded-full border-2 border-gray-600" />}
                      <span className="text-sm text-gray-300">上传文件</span>
                    </div>
                    {processingStatus.upload === 'processing' && (
                      <span className="text-xs text-gray-400">{processingStatus.uploadProgress}%</span>
                    )}
                  </div>
                  {processingStatus.upload === 'processing' && (
                    <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="h-full bg-purple-500 transition-all duration-300"
                        style={{ width: `${processingStatus.uploadProgress}%` }}
                      />
                    </div>
                  )}
                </div>
                
                {/* Audio Extract Status */}
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    {processingStatus.audioExtract === 'processing' && <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />}
                    {processingStatus.audioExtract === 'completed' && <CheckCircle className="w-4 h-4 text-green-500" />}
                    {processingStatus.audioExtract === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                    {processingStatus.audioExtract === 'idle' && <div className="w-4 h-4 rounded-full border-2 border-gray-600" />}
                    <span className="text-sm text-gray-300">音频提取</span>
                  </div>
                </div>
                
                {/* Transcription Status */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {processingStatus.transcription === 'processing' && <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />}
                      {processingStatus.transcription === 'completed' && <CheckCircle className="w-4 h-4 text-green-500" />}
                      {processingStatus.transcription === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                      {processingStatus.transcription === 'idle' && <div className="w-4 h-4 rounded-full border-2 border-gray-600" />}
                      <span className="text-sm text-gray-300">语音转录</span>
                    </div>
                    {processingStatus.transcription === 'processing' && (
                      <span className="text-xs text-gray-400">{processingStatus.transcriptionProgress}%</span>
                    )}
                  </div>
                  {processingStatus.transcription === 'processing' && (
                    <div className="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="h-full bg-purple-500 transition-all duration-300"
                        style={{ width: `${processingStatus.transcriptionProgress}%` }}
                      />
                    </div>
                  )}
                </div>
                
                {/* Completed message */}
                {processingStatus.transcription === 'completed' && (
                  <div className="mt-4 pt-3 border-t border-gray-700">
                    <p className="text-sm text-green-400 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      处理完成！
                    </p>
                  </div>
                )}
                
                {/* Error message */}
                {(processingStatus.upload === 'error' || processingStatus.audioExtract === 'error' || processingStatus.transcription === 'error') && (
                  <div className="mt-4 pt-3 border-t border-gray-700">
                    <p className="text-sm text-red-400 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      处理出错，请重试
                    </p>
                  </div>
                )}
              </div>
            )}

            {videoUrl ? (
              <div className="relative bg-black rounded-lg overflow-hidden shadow-2xl" style={{ maxHeight: '70vh', aspectRatio: '16/9' }}>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-contain"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={() => setIsPlaying(false)}
                />
              </div>
            ) : (
              /* Empty State - Upload Prompt */
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full max-w-2xl mx-auto cursor-pointer group"
              >
                <div className="border-2 border-dashed border-[#3a3a3a] hover:border-[#7c3aed] rounded-2xl p-12 text-center transition-all duration-300 group-hover:bg-[#7c3aed]/5">
                  {/* Upload Icon */}
                  <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#2a2a2a] group-hover:bg-[#7c3aed]/20 flex items-center justify-center transition-all duration-300">
                    <Upload className="w-10 h-10 text-gray-500 group-hover:text-[#7c3aed] transition-colors" />
                  </div>
                  
                  {/* Main Text */}
                  <h3 className="text-xl font-semibold text-white mb-2">
                    Upload a video to get started
                  </h3>
                  <p className="text-gray-400 mb-6">
                    Drag and drop or click to browse
                  </p>
                  
                  {/* Upload Button */}
                  <button className="bg-[#7c3aed] hover:bg-[#6d28d9] text-white px-8 py-3 rounded-lg font-medium transition-colors inline-flex items-center gap-2">
                    <Upload className="w-5 h-5" />
                    Choose File
                  </button>
                  
                  {/* Supported formats */}
                  <p className="text-xs text-gray-600 mt-6">
                    Supports MP4, MOV, WebM, AVI, MP3, WAV and more
                  </p>
                  
                  {/* Alternative options */}
                  <div className="mt-8 pt-6 border-t border-[#2a2a2a]">
                    <p className="text-sm text-gray-500 mb-4">Or start with:</p>
                    <div className="flex items-center justify-center gap-4">
                      <button className="flex items-center gap-2 px-4 py-2 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded-lg text-sm transition">
                        <Mic className="w-4 h-4 text-red-400" />
                        <span>Record Audio</span>
                      </button>
                      <button className="flex items-center gap-2 px-4 py-2 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded-lg text-sm transition">
                        <Monitor className="w-4 h-4 text-blue-400" />
                        <span>Screen Recording</span>
                      </button>
                      <button className="flex items-center gap-2 px-4 py-2 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded-lg text-sm transition">
                        <Video className="w-4 h-4 text-green-400" />
                        <span>Record Video</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Video Controls */}
          <div className="px-6 py-3 bg-[#1a1a1a] border-t border-[#2a2a2a]">
            <div className="flex items-center gap-4">
              {/* Play Controls */}
              <div className="flex items-center gap-1">
                <button className="p-2 hover:bg-[#2a2a2a] rounded-lg transition">
                  <SkipBack className="w-4 h-4" />
                </button>
                <button 
                  onClick={togglePlay}
                  className="p-2 bg-[#7c3aed] hover:bg-[#6d28d9] rounded-lg transition"
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" fill="white" />}
                </button>
                <button className="p-2 hover:bg-[#2a2a2a] rounded-lg transition">
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              {/* Time */}
              <div className="text-sm text-gray-400">
                <span className="text-white">{formatTime(currentTime)}</span>
                <span className="mx-1">/</span>
                <span>{formatTime(duration)}</span>
              </div>

              {/* Progress Bar */}
              <div className="flex-1 h-1 bg-[#2a2a2a] rounded-full cursor-pointer group">
                <div 
                  className="h-full bg-[#7c3aed] rounded-full relative"
                  style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition" />
                </div>
              </div>

              {/* Volume */}
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-2 hover:bg-[#2a2a2a] rounded-lg transition"
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    setVolume(parseFloat(e.target.value));
                    setIsMuted(false);
                  }}
                  className="w-20 accent-[#7c3aed]"
                />
              </div>

              {/* Fullscreen */}
              <button className="p-2 hover:bg-[#2a2a2a] rounded-lg transition">
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </main>

        {/* Right Panel - Properties / Underlord */}
        {(showRightPanel || showUnderlord) && (
          <aside className="w-72 bg-[#1a1a1a] border-l border-[#2a2a2a] flex flex-col flex-shrink-0">
            {showUnderlord ? (
              <UnderlordPanel onClose={() => setShowUnderlord(false)} />
            ) : (
              <PropertiesPanel />
            )}
          </aside>
        )}
      </div>

      {/* Bottom - Timeline */}
      <div className="h-32 bg-[#1a1a1a] border-t border-[#2a2a2a] flex-shrink-0">
        <MiniTimeline />
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <ExportModal onClose={() => setShowExportModal(false)} />
      )}
    </div>
  );
}

// Script Panel Component - Descript-style text-based editing
function ScriptPanel() {
  const { 
    transcript, 
    transcriptionStatus,
    currentTime, 
    seekTo,
    setIsPlaying 
  } = useEditorStore();
  const [selectedLanguage, setSelectedLanguage] = useState('English (US)');
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  
  const handleWordClick = (startTime: number) => {
    console.log('Word clicked, seeking to:', startTime);
    seekTo(startTime);
    setIsPlaying(false);
  };

  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isWordActive = (wordStartTime: number, wordEndTime: number) => {
    return currentTime >= wordStartTime && currentTime < wordEndTime;
  };

  // Get current timestamp for display
  const getCurrentTimestamp = () => {
    return formatTimestamp(currentTime);
  };

  // Show transcription progress
  if (transcriptionStatus && transcriptionStatus.status === 'processing') {
    return (
      <div className="flex flex-col h-full bg-white">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">🌐</span>
            <span className="text-gray-700">{selectedLanguage}</span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </div>
        </div>
        {/* Loading State */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
          <p className="text-gray-600 font-medium mb-2">Translating script...</p>
          <div className="w-48 bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${transcriptionStatus.progress || 0}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Show error state
  if (transcriptionStatus && transcriptionStatus.status === 'error') {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">🌐</span>
            <span className="text-gray-700">{selectedLanguage}</span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <X className="w-6 h-6 text-red-500" />
          </div>
          <p className="text-gray-700 font-medium mb-2">Transcription failed</p>
          <p className="text-gray-500 text-sm text-center px-4">
            {transcriptionStatus.error || 'Unable to process audio. Please try again.'}
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Language Selector Header - Descript Style */}
      <div className="px-6 py-3 border-b border-gray-200">
        <div 
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-gray-100 cursor-pointer transition"
          onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
        >
          <span className="text-gray-500">🌐</span>
          <span className="text-gray-700 text-sm">{selectedLanguage}</span>
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </div>
        
        {/* Language Dropdown */}
        {showLanguageDropdown && (
          <div className="absolute mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-[160px]">
            {['English (US)', 'Chinese (Simplified)', 'Japanese', 'Korean', 'Spanish'].map(lang => (
              <div
                key={lang}
                onClick={() => {
                  setSelectedLanguage(lang);
                  setShowLanguageDropdown(false);
                }}
                className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm text-gray-700"
              >
                {lang}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transcript Content - Descript Document Style */}
      <div className="flex-1 overflow-auto" ref={contentRef}>
        {transcript && transcript.segments && transcript.segments.length > 0 ? (
          <div className="px-6 py-4">
            {/* Timestamp indicator */}
            <div className="flex items-center gap-4 mb-4 text-sm text-gray-500">
              <span>{getCurrentTimestamp()}</span>
            </div>
            
            {/* Continuous text flow - Descript style */}
            <div className="prose prose-lg max-w-none">
              <p className="text-gray-800 leading-[2] text-lg font-normal tracking-wide">
                {transcript.segments.map((segment: any, segIndex: number) => {
                  const segmentStartTime = segment.startTime ?? segment.start ?? 0;
                  
                  // If segment has words with timing, render clickable words
                  if (segment.words && segment.words.length > 0) {
                    return segment.words.map((word: any, wordIndex: number) => {
                      const wordStart = word.startTime ?? word.start ?? 0;
                      const wordEnd = word.endTime ?? word.end ?? wordStart + 0.5;
                      const isActive = isWordActive(wordStart, wordEnd);
                      const wordText = word.text || word.word || '';
                      
                      return (
                        <span
                          key={`${segment.id || segIndex}-word-${wordIndex}`}
                          onClick={() => handleWordClick(wordStart)}
                          className={`cursor-pointer transition-all duration-150 rounded-sm ${
                            isActive 
                              ? 'bg-blue-500 text-white px-0.5' 
                              : 'hover:bg-blue-100'
                          }`}
                        >
                          {wordText}{' '}
                        </span>
                      );
                    });
                  }
                  
                  // Otherwise, split text and create pseudo-words (clickable at segment level)
                  const words = (segment.text || '').split(/(\s+)/);
                  const segmentDuration = (segment.endTime ?? segment.end ?? segmentStartTime + 1) - segmentStartTime;
                  const wordsOnly = words.filter((w: string) => w.trim());
                  const timePerWord = segmentDuration / Math.max(wordsOnly.length, 1);
                  
                  let wordCounter = 0;
                  return words.map((word: string, wordIndex: number) => {
                    if (!word.trim()) {
                      return <span key={`${segment.id || segIndex}-space-${wordIndex}`}>{word}</span>;
                    }
                    
                    const wordStart = segmentStartTime + (wordCounter * timePerWord);
                    const wordEnd = wordStart + timePerWord;
                    const isActive = isWordActive(wordStart, wordEnd);
                    wordCounter++;
                    
                    return (
                      <span
                        key={`${segment.id || segIndex}-text-${wordIndex}`}
                        onClick={() => handleWordClick(wordStart)}
                        className={`cursor-pointer transition-all duration-150 rounded-sm ${
                          isActive 
                            ? 'bg-blue-500 text-white px-0.5' 
                            : 'hover:bg-blue-100'
                        }`}
                      >
                        {word}{' '}
                      </span>
                    );
                  });
                })}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-gray-500">
            <FileText className="w-12 h-12 mb-4 text-gray-300" />
            <p className="text-gray-600 mb-2">No transcript available</p>
            <p className="text-sm text-gray-400 text-center px-6">
              Upload a video to automatically<br />generate speech-to-text
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Scenes Panel Component - Similar to Descript layouts
function ScenesPanel() {
  const [selectedScene, setSelectedScene] = useState<string | null>(null);
  
  // Mock scenes data for demo
  const [scenes] = useState([
    {
      id: 'intro',
      name: 'Intro',
      thumbnail: null,
      duration: 5,
      startTime: 0,
      layout: 'fullscreen',
    },
    {
      id: 'main',
      name: 'Main Content',
      thumbnail: null,
      duration: 30,
      startTime: 5,
      layout: 'speaker-left',
    },
    {
      id: 'outro',
      name: 'Outro',
      thumbnail: null,
      duration: 10,
      startTime: 35,
      layout: 'fullscreen',
    }
  ]);
  
  const layouts = [
    { id: 'fullscreen', name: 'Fullscreen', icon: Monitor },
    { id: 'speaker-left', name: 'Speaker Left', icon: Layers },
    { id: 'speaker-right', name: 'Speaker Right', icon: Layers },
    { id: 'split', name: 'Split Screen', icon: Layers },
  ];
  
  return (
    <div className="flex flex-col h-full">
      {/* Scenes List */}
      <div className="flex-1 overflow-auto p-4">
        {scenes.length > 0 ? (
          <div className="space-y-2">
            {scenes.map((scene, index) => (
              <div
                key={scene.id}
                onClick={() => setSelectedScene(scene.id)}
                className={`p-3 rounded-lg cursor-pointer transition border ${
                  selectedScene === scene.id
                    ? 'bg-[#7c3aed]/20 border-[#7c3aed]'
                    : 'bg-[#2a2a2a] border-transparent hover:bg-[#3a3a3a]'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Scene Number */}
                  <div className="w-6 h-6 rounded bg-[#1a1a1a] flex items-center justify-center text-xs text-gray-400">
                    {index + 1}
                  </div>
                  
                  {/* Thumbnail Placeholder */}
                  <div className="w-16 h-10 bg-[#1a1a1a] rounded flex items-center justify-center">
                    <Video className="w-5 h-5 text-gray-600" />
                  </div>
                  
                  {/* Scene Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {scene.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {Math.floor(scene.duration)}s • {scene.layout}
                    </p>
                  </div>
                  
                  {/* More Options */}
                  <button className="p-1 hover:bg-[#3a3a3a] rounded opacity-0 group-hover:opacity-100 transition">
                    <MoreHorizontal className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-gray-500">
            <Layers className="w-12 h-12 mx-auto mb-3 text-gray-600" />
            <p className="mb-2">No scenes yet</p>
            <p className="text-sm text-gray-600 mb-4">
              Add scenes to organize<br />your video into sections
            </p>
          </div>
        )}
      </div>
      
      {/* Layout Templates */}
      <div className="px-4 py-3 border-t border-[#2a2a2a]">
        <p className="text-xs text-gray-500 mb-2">Layouts</p>
        <div className="grid grid-cols-4 gap-1">
          {layouts.map((layout) => (
            <button
              key={layout.id}
              className="aspect-square bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded flex items-center justify-center transition"
              title={layout.name}
            >
              <layout.icon className="w-4 h-4 text-gray-500" />
            </button>
          ))}
        </div>
      </div>
      
      {/* Add Scene Button */}
      <div className="p-4 border-t border-[#2a2a2a]">
        <button className="w-full bg-[#2a2a2a] hover:bg-[#3a3a3a] px-4 py-2 rounded-lg text-sm transition flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" />
          <span>Add scene</span>
        </button>
      </div>
    </div>
  );
}

// Media Panel Component  
function MediaPanel({ onUpload }: { onUpload?: (files: FileList | null) => void }) {
  const { mediaFiles, addMediaFile, setVideoUrl } = useEditorStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    // Use parent upload handler if available
    if (onUpload) {
      onUpload(files);
      return;
    }
    
    // Handle file upload (fallback)
    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file);
      const type = file.type.startsWith('video/') ? 'video'
        : file.type.startsWith('audio/') ? 'audio' : 'image';
      
      addMediaFile({
        id: crypto.randomUUID(),
        name: file.name,
        type,
        url,
        duration: 0,
        size: file.size,
        thumbnails: [],
        waveform: [],
      });

      // Set first video as main video
      if (type === 'video') {
        setVideoUrl(url);
      }
    }
  };

  const handleMediaClick = (file: { type: string; url: string }) => {
    if (file.type === 'video') {
      setVideoUrl(file.url);
    }
  };
  
  return (
    <div className="p-4">
      {/* Upload Area */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,audio/*,image/*"
        multiple
        onChange={handleUpload}
        className="hidden"
      />
      
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full border-2 border-dashed border-[#3a3a3a] hover:border-[#7c3aed] rounded-lg p-6 text-center transition mb-4 group"
      >
        <Upload className="w-8 h-8 mx-auto mb-2 text-gray-500 group-hover:text-[#7c3aed]" />
        <p className="text-sm text-gray-400 group-hover:text-white">Drop files or click to upload</p>
      </button>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <button className="flex flex-col items-center gap-1 p-3 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded-lg transition">
          <Video className="w-5 h-5 text-gray-400" />
          <span className="text-xs text-gray-500">Video</span>
        </button>
        <button className="flex flex-col items-center gap-1 p-3 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded-lg transition">
          <Mic className="w-5 h-5 text-gray-400" />
          <span className="text-xs text-gray-500">Record</span>
        </button>
        <button className="flex flex-col items-center gap-1 p-3 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded-lg transition">
          <Monitor className="w-5 h-5 text-gray-400" />
          <span className="text-xs text-gray-500">Screen</span>
        </button>
      </div>

      {/* Media List */}
      {mediaFiles.length > 0 ? (
        <div className="space-y-2">
          {mediaFiles.map((file) => (
            <div 
              key={file.id}
              onClick={() => handleMediaClick(file)}
              className="flex items-center gap-3 p-2 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded-lg cursor-pointer transition group"
            >
              <div className="w-16 h-10 bg-[#1a1a1a] rounded flex items-center justify-center overflow-hidden">
                {file.type === 'video' ? (
                  <Video className="w-5 h-5 text-gray-500" />
                ) : file.type === 'audio' ? (
                  <Music className="w-5 h-5 text-gray-500" />
                ) : (
                  <Image className="w-5 h-5 text-gray-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{file.name}</p>
                <p className="text-xs text-gray-500">{file.type}</p>
              </div>
              <Play className="w-4 h-4 text-gray-500 opacity-0 group-hover:opacity-100 transition" />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 text-center">No media files yet</p>
      )}
    </div>
  );
}

// Properties Panel Component
function PropertiesPanel() {
  const [activeTab, setActiveTab] = useState<'properties' | 'effects' | 'audio'>('properties');
  
  return (
    <div className="flex-1 flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-[#2a2a2a]">
        <button 
          onClick={() => setActiveTab('properties')}
          className={`flex-1 px-3 py-3 text-xs font-medium transition ${
            activeTab === 'properties' 
              ? 'text-white border-b-2 border-[#7c3aed]' 
              : 'text-gray-500 hover:text-white'
          }`}
        >
          Properties
        </button>
        <button 
          onClick={() => setActiveTab('effects')}
          className={`flex-1 px-3 py-3 text-xs font-medium transition ${
            activeTab === 'effects' 
              ? 'text-white border-b-2 border-[#7c3aed]' 
              : 'text-gray-500 hover:text-white'
          }`}
        >
          Effects
        </button>
        <button 
          onClick={() => setActiveTab('audio')}
          className={`flex-1 px-3 py-3 text-xs font-medium transition ${
            activeTab === 'audio' 
              ? 'text-white border-b-2 border-[#7c3aed]' 
              : 'text-gray-500 hover:text-white'
          }`}
        >
          Audio
        </button>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'properties' && (
          <div className="space-y-4">
            {/* Transform */}
            <div>
              <h4 className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Transform</h4>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">X</label>
                  <input 
                    type="number" 
                    defaultValue={0}
                    className="w-full bg-[#2a2a2a] border border-[#3a3a3a] rounded px-2 py-1 text-sm focus:outline-none focus:border-[#7c3aed]"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Y</label>
                  <input 
                    type="number" 
                    defaultValue={0}
                    className="w-full bg-[#2a2a2a] border border-[#3a3a3a] rounded px-2 py-1 text-sm focus:outline-none focus:border-[#7c3aed]"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Width</label>
                  <input 
                    type="number" 
                    defaultValue={1920}
                    className="w-full bg-[#2a2a2a] border border-[#3a3a3a] rounded px-2 py-1 text-sm focus:outline-none focus:border-[#7c3aed]"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Height</label>
                  <input 
                    type="number" 
                    defaultValue={1080}
                    className="w-full bg-[#2a2a2a] border border-[#3a3a3a] rounded px-2 py-1 text-sm focus:outline-none focus:border-[#7c3aed]"
                  />
                </div>
              </div>
            </div>
            
            {/* Opacity */}
            <div>
              <h4 className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Opacity</h4>
              <input
                type="range"
                min="0"
                max="100"
                defaultValue={100}
                className="w-full accent-[#7c3aed]"
              />
            </div>
            
            {/* Speed */}
            <div>
              <h4 className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Speed</h4>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="25"
                  max="400"
                  defaultValue={100}
                  className="flex-1 accent-[#7c3aed]"
                />
                <span className="text-sm text-gray-400 w-12">100%</span>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'effects' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 mb-3">Add effects to enhance your video</p>
            
            {[
              { name: 'Studio Sound', desc: 'Enhance audio quality', icon: Music },
              { name: 'Green Screen', desc: 'Remove background', icon: Layers },
              { name: 'Eye Contact', desc: 'AI eye contact correction', icon: Sparkles },
              { name: 'Background Blur', desc: 'Blur the background', icon: Shapes },
            ].map((effect, i) => (
              <button 
                key={i}
                className="w-full flex items-center gap-3 p-3 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded-lg transition text-left"
              >
                <div className="w-8 h-8 bg-[#7c3aed]/20 rounded-lg flex items-center justify-center">
                  <effect.icon className="w-4 h-4 text-[#7c3aed]" />
                </div>
                <div>
                  <p className="text-sm font-medium">{effect.name}</p>
                  <p className="text-xs text-gray-500">{effect.desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        
        {activeTab === 'audio' && (
          <div className="space-y-4">
            {/* Volume */}
            <div>
              <h4 className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Volume</h4>
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-gray-500" />
                <input
                  type="range"
                  min="0"
                  max="100"
                  defaultValue={100}
                  className="flex-1 accent-[#7c3aed]"
                />
                <span className="text-sm text-gray-400 w-12">100%</span>
              </div>
            </div>
            
            {/* Audio Enhancements */}
            <div>
              <h4 className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Enhancements</h4>
              <div className="space-y-2">
                {[
                  { name: 'Remove filler words', checked: false },
                  { name: 'Remove silence', checked: true },
                  { name: 'Noise reduction', checked: true },
                  { name: 'Loudness normalization', checked: false },
                ].map((item, i) => (
                  <label key={i} className="flex items-center gap-3 p-2 bg-[#2a2a2a] rounded cursor-pointer hover:bg-[#3a3a3a] transition">
                    <input 
                      type="checkbox" 
                      defaultChecked={item.checked}
                      className="accent-[#7c3aed]" 
                    />
                    <span className="text-sm">{item.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Underlord AI Panel Component - Powered by Claude
function UnderlordPanel({ onClose }: { onClose: () => void }) {
  const { transcript } = useEditorStore();
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Array<{role: 'user' | 'ai', content: string}>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('Chinese');
  const [showLanguageSelect, setShowLanguageSelect] = useState(false);
  
  // Get transcript text for AI processing
  const getTranscriptText = (): string => {
    if (!transcript || !transcript.segments) return '';
    return transcript.segments
      .map((seg: any) => seg.text || seg.words?.map((w: any) => w.text || w.word).join(' '))
      .join(' ');
  };

  const aiActions = [
    { 
      id: 'remove-filler-words',
      icon: Scissors, 
      title: 'Remove filler words', 
      desc: 'um, uh, like, you know...',
      color: '#f59e0b'
    },
    { 
      id: 'generate-summary',
      icon: FileText, 
      title: 'Generate summary', 
      desc: 'Create video summary',
      color: '#8b5cf6'
    },
    { 
      id: 'generate-show-notes',
      icon: MessageSquare, 
      title: 'Show Notes', 
      desc: 'Generate show notes',
      color: '#06b6d4'
    },
    { 
      id: 'generate-social-posts',
      icon: Share2, 
      title: 'Social Posts', 
      desc: 'Create social media content',
      color: '#ec4899'
    },
    { 
      id: 'suggest-cuts',
      icon: Clock, 
      title: 'Suggest Cuts', 
      desc: 'Find content to remove',
      color: '#ef4444'
    },
    { 
      id: 'translate',
      icon: Layers, 
      title: 'Translate', 
      desc: 'Translate to other language',
      color: '#10b981'
    },
    { 
      id: 'generate-chapters',
      icon: Layers, 
      title: 'Chapters', 
      desc: 'Generate chapter markers',
      color: '#f97316'
    },
    { 
      id: 'improve-transcript',
      icon: Sparkles, 
      title: 'Improve Text', 
      desc: 'Fix grammar & clarity',
      color: '#7c3aed'
    },
  ];

  const languages = ['Chinese', 'English', 'Japanese', 'Korean', 'Spanish', 'French', 'German'];

  const handleSend = async () => {
    if (!prompt.trim()) return;
    
    const transcriptText = getTranscriptText();
    setMessages([...messages, { role: 'user', content: prompt }]);
    setPrompt('');
    setIsLoading(true);
    
    try {
      const { aiApi } = await import('@/lib/api');
      const response = await aiApi.chat(
        [{ role: 'user', content: transcriptText ? `Video transcript: ${transcriptText}\n\nUser question: ${prompt}` : prompt }],
        'You are Underlord, an AI assistant for video editing. Help users edit their videos, analyze transcripts, and provide creative suggestions. Be concise and helpful.'
      );
      
      setMessages(prev => [...prev, { 
        role: 'ai', 
        content: response.data.data.response
      }]);
    } catch (error: any) {
      setMessages(prev => [...prev, { 
        role: 'ai', 
        content: error.response?.data?.error || 'Sorry, I encountered an error. Please check if ANTHROPIC_API_KEY is configured in the backend.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleActionClick = async (action: typeof aiActions[0]) => {
    const transcriptText = getTranscriptText();
    
    if (!transcriptText) {
      setMessages([...messages, 
        { role: 'user', content: action.title },
        { role: 'ai', content: 'Please upload a video and wait for transcription to complete first. I need the transcript text to process this request.' }
      ]);
      return;
    }

    setMessages([...messages, { role: 'user', content: action.title }]);
    setIsLoading(true);
    
    try {
      const { aiApi } = await import('@/lib/api');
      const data: { transcript: string; targetLanguage?: string; platform?: string } = {
        transcript: transcriptText,
      };
      
      if (action.id === 'translate') {
        data.targetLanguage = selectedLanguage;
      }
      
      const response = await aiApi.executeSkill(action.id, data);
      
      if (response.data.success) {
        setMessages(prev => [...prev, { 
          role: 'ai', 
          content: response.data.data.result
        }]);
      } else {
        throw new Error(response.data.error);
      }
    } catch (error: any) {
      setMessages(prev => [...prev, { 
        role: 'ai', 
        content: error.response?.data?.error || error.message || 'Sorry, I encountered an error processing your request.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-[#2a2a2a] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-[#7c3aed] to-[#ec4899] rounded-lg flex items-center justify-center">
            <Wand2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-medium text-sm">Underlord AI</h3>
            <p className="text-xs text-gray-500">Powered by Claude</p>
          </div>
        </div>
        <button 
          onClick={onClose} 
          className="p-1 hover:bg-[#2a2a2a] rounded text-gray-500 hover:text-white transition"
        >
          ×
        </button>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-auto">
        {messages.length === 0 ? (
          <div className="p-4">
            <p className="text-sm text-gray-400 mb-4">
              What would you like me to help with?
            </p>
            
            {/* Language selector for translate */}
            {showLanguageSelect && (
              <div className="mb-4 p-3 bg-[#2a2a2a] rounded-lg">
                <p className="text-xs text-gray-400 mb-2">Translate to:</p>
                <div className="flex flex-wrap gap-1">
                  {languages.map(lang => (
                    <button
                      key={lang}
                      onClick={() => {
                        setSelectedLanguage(lang);
                        setShowLanguageSelect(false);
                        const translateAction = aiActions.find(a => a.id === 'translate');
                        if (translateAction) handleActionClick(translateAction);
                      }}
                      className={`px-2 py-1 text-xs rounded transition ${
                        selectedLanguage === lang 
                          ? 'bg-[#7c3aed] text-white' 
                          : 'bg-[#3a3a3a] hover:bg-[#4a4a4a] text-gray-300'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Quick Actions Grid */}
            <div className="grid grid-cols-2 gap-2">
              {aiActions.map((action, i) => (
                <button
                  key={i}
                  onClick={() => {
                    if (action.id === 'translate') {
                      setShowLanguageSelect(true);
                    } else {
                      handleActionClick(action);
                    }
                  }}
                  className="p-3 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded-lg text-left transition group"
                >
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center mb-2 transition-transform group-hover:scale-110"
                    style={{ backgroundColor: `${action.color}20` }}
                  >
                    <action.icon className="w-4 h-4" style={{ color: action.color }} />
                  </div>
                  <p className="text-xs font-medium text-white">{action.title}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{action.desc}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {messages.map((msg, i) => (
              <div 
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user' 
                      ? 'bg-[#7c3aed] text-white' 
                      : 'bg-[#2a2a2a] text-gray-300'
                  }`}
                >
                  <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-[#2a2a2a] rounded-lg px-4 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-[#7c3aed] animate-spin" />
                    <span className="text-gray-500">Claude is thinking...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Back button when in conversation */}
      {messages.length > 0 && (
        <div className="px-4 py-2 border-t border-[#2a2a2a]">
          <button
            onClick={() => {
              setMessages([]);
              setShowLanguageSelect(false);
            }}
            className="text-xs text-gray-500 hover:text-white transition flex items-center gap-1"
          >
            <ChevronLeft className="w-3 h-3" />
            Back to Skills
          </button>
        </div>
      )}
      
      {/* Input */}
      <div className="p-4 border-t border-[#2a2a2a]">
        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask Claude anything..."
            className="flex-1 bg-[#2a2a2a] border border-[#3a3a3a] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#7c3aed]"
          />
          <button 
            onClick={handleSend}
            disabled={!prompt.trim() || isLoading}
            className="bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition"
          >
            <Sparkles className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Mini Timeline Component
function MiniTimeline() {
  const { tracks, currentTime, duration, setCurrentTime, setIsPlaying } = useEditorStore();
  const [zoom, setZoom] = useState(1);
  const timelineRef = useRef<HTMLDivElement>(null);
  const pixelsPerSecond = 50 * zoom;
  
  // Mock tracks for demo
  const [demoTracks] = useState([
    {
      id: 'video-1',
      type: 'video',
      name: 'Video',
      color: '#7c3aed',
      clips: [
        { id: 'clip-1', name: 'Intro.mp4', startTime: 0, duration: 5 },
        { id: 'clip-2', name: 'Main.mp4', startTime: 5, duration: 30 },
        { id: 'clip-3', name: 'Outro.mp4', startTime: 35, duration: 10 },
      ]
    },
    {
      id: 'audio-1',
      type: 'audio',
      name: 'Audio',
      color: '#06b6d4',
      clips: [
        { id: 'clip-4', name: 'Background Music', startTime: 0, duration: 45 },
      ]
    },
    {
      id: 'caption-1',
      type: 'caption',
      name: 'Captions',
      color: '#f59e0b',
      clips: [
        { id: 'clip-5', name: 'Subtitles', startTime: 0, duration: 45 },
      ]
    }
  ]);

  const displayTracks = tracks.length > 0 ? tracks : demoTracks;
  const totalDuration = duration > 0 ? duration : 45;

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft;
    const newTime = Math.max(0, Math.min(x / pixelsPerSecond, totalDuration));
    setCurrentTime(newTime);
    setIsPlaying(false);
  };
  
  return (
    <div className="h-full flex flex-col">
      {/* Timeline Controls */}
      <div className="h-8 border-b border-[#2a2a2a] flex items-center px-4 gap-4">
        {/* Track Labels Header */}
        <div className="w-20 flex-shrink-0">
          <span className="text-xs text-gray-500">Tracks</span>
        </div>
        
        <div className="flex-1 flex items-center justify-between">
          {/* Zoom Controls */}
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
              className="p-1 hover:bg-[#2a2a2a] rounded"
            >
              <ZoomOut className="w-4 h-4 text-gray-500" />
            </button>
            <span className="text-xs text-gray-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button 
              onClick={() => setZoom(Math.min(4, zoom + 0.25))}
              className="p-1 hover:bg-[#2a2a2a] rounded"
            >
              <ZoomIn className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* Add Track Button */}
          <button className="flex items-center gap-1 px-2 py-1 hover:bg-[#2a2a2a] rounded text-xs text-gray-500 transition">
            <Plus className="w-3 h-3" />
            Add Track
          </button>
        </div>
      </div>
      
      {/* Timeline Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track Labels */}
        <div className="w-20 flex-shrink-0 bg-[#151515] border-r border-[#2a2a2a]">
          {/* Spacer for ruler */}
          <div className="h-5 border-b border-[#2a2a2a]" />
          {/* Track labels */}
          {displayTracks.map((track: any) => (
            <div 
              key={track.id}
              className="h-14 px-2 flex items-center gap-1 border-b border-[#2a2a2a]"
            >
              <div 
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: track.color }}
              />
              <span className="text-xs text-gray-400 truncate">{track.name}</span>
            </div>
          ))}
        </div>

        {/* Scrollable Timeline Area */}
        <div 
          ref={timelineRef}
          className="flex-1 overflow-x-auto overflow-y-hidden cursor-pointer"
          onClick={handleTimelineClick}
        >
          <div 
            className="relative h-full"
            style={{ width: Math.max(totalDuration * pixelsPerSecond + 100, 800) }}
          >
            {/* Time Ruler */}
            <div className="h-5 border-b border-[#2a2a2a] relative bg-[#151515]">
              {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full flex flex-col items-center"
                  style={{ left: i * pixelsPerSecond }}
                >
                  <div className="h-2 w-px bg-[#3a3a3a]" />
                  <span className="text-[10px] text-gray-600">{i}s</span>
                </div>
              ))}
            </div>
            
            {/* Playhead */}
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-[#ff4444] z-30 pointer-events-none"
              style={{ left: currentTime * pixelsPerSecond }}
            >
              <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[#ff4444]" />
            </div>
            
            {/* Tracks */}
            <div className="absolute top-5 left-0 right-0 bottom-0">
              {displayTracks.map((track: any) => (
                <div key={track.id} className="h-14 border-b border-[#2a2a2a] relative">
                  {track.clips.map((clip: any) => (
                    <div
                      key={clip.id}
                      className="absolute top-1 bottom-1 rounded cursor-move group transition-all hover:brightness-110"
                      style={{
                        left: clip.startTime * pixelsPerSecond,
                        width: clip.duration * pixelsPerSecond,
                        backgroundColor: `${track.color}30`,
                        borderLeft: `3px solid ${track.color}`,
                      }}
                    >
                      {/* Clip Content */}
                      <div className="h-full px-2 py-1 flex items-center overflow-hidden">
                        <span className="text-xs text-white/80 truncate">
                          {clip.name}
                        </span>
                      </div>
                      
                      {/* Resize Handles */}
                      <div className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize opacity-0 group-hover:opacity-100 transition" />
                      <div className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize opacity-0 group-hover:opacity-100 transition" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Export Modal Component
function ExportModal({ onClose }: { onClose: () => void }) {
  const [exportFormat, setExportFormat] = useState('mp4');
  const [quality, setQuality] = useState('1080p');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const formats = [
    { id: 'mp4', name: 'MP4', desc: 'Best for sharing online', icon: Video },
    { id: 'mov', name: 'MOV', desc: 'High quality for editing', icon: Video },
    { id: 'webm', name: 'WebM', desc: 'Web optimized', icon: Video },
    { id: 'mp3', name: 'MP3', desc: 'Audio only', icon: Music },
    { id: 'wav', name: 'WAV', desc: 'Lossless audio', icon: Music },
    { id: 'gif', name: 'GIF', desc: 'Animated image', icon: Image },
  ];

  const qualities = [
    { id: '4k', name: '4K', desc: '3840 × 2160' },
    { id: '1080p', name: '1080p', desc: '1920 × 1080' },
    { id: '720p', name: '720p', desc: '1280 × 720' },
    { id: '480p', name: '480p', desc: '854 × 480' },
  ];

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress(0);
    
    // Simulate export progress
    const interval = setInterval(() => {
      setExportProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + Math.random() * 15;
      });
    }, 500);

    // Simulate completion
    setTimeout(() => {
      clearInterval(interval);
      setExportProgress(100);
      setTimeout(() => {
        setIsExporting(false);
        onClose();
      }, 1000);
    }, 4000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-[#1a1a1a] rounded-xl shadow-2xl w-[500px] max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a2a]">
          <div>
            <h2 className="text-lg font-semibold">Export Video</h2>
            <p className="text-sm text-gray-500">Choose your export settings</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-[#2a2a2a] rounded-lg transition"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[50vh] overflow-auto">
          {/* Format Selection */}
          <div>
            <h3 className="text-sm font-medium mb-3">Format</h3>
            <div className="grid grid-cols-3 gap-2">
              {formats.map((format) => (
                <button
                  key={format.id}
                  onClick={() => setExportFormat(format.id)}
                  className={`p-3 rounded-lg border text-left transition ${
                    exportFormat === format.id
                      ? 'bg-[#7c3aed]/20 border-[#7c3aed]'
                      : 'bg-[#2a2a2a] border-transparent hover:bg-[#3a3a3a]'
                  }`}
                >
                  <format.icon className="w-5 h-5 mb-1 text-gray-400" />
                  <p className="text-sm font-medium">{format.name}</p>
                  <p className="text-[10px] text-gray-500">{format.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Quality Selection */}
          <div>
            <h3 className="text-sm font-medium mb-3">Quality</h3>
            <div className="grid grid-cols-4 gap-2">
              {qualities.map((q) => (
                <button
                  key={q.id}
                  onClick={() => setQuality(q.id)}
                  className={`p-3 rounded-lg border text-center transition ${
                    quality === q.id
                      ? 'bg-[#7c3aed]/20 border-[#7c3aed]'
                      : 'bg-[#2a2a2a] border-transparent hover:bg-[#3a3a3a]'
                  }`}
                >
                  <p className="text-sm font-medium">{q.name}</p>
                  <p className="text-[10px] text-gray-500">{q.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Additional Options */}
          <div>
            <h3 className="text-sm font-medium mb-3">Options</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-2 bg-[#2a2a2a] rounded cursor-pointer hover:bg-[#3a3a3a] transition">
                <input type="checkbox" defaultChecked className="accent-[#7c3aed]" />
                <span className="text-sm">Include captions</span>
              </label>
              <label className="flex items-center gap-3 p-2 bg-[#2a2a2a] rounded cursor-pointer hover:bg-[#3a3a3a] transition">
                <input type="checkbox" className="accent-[#7c3aed]" />
                <span className="text-sm">Export transcript as separate file</span>
              </label>
              <label className="flex items-center gap-3 p-2 bg-[#2a2a2a] rounded cursor-pointer hover:bg-[#3a3a3a] transition">
                <input type="checkbox" className="accent-[#7c3aed]" />
                <span className="text-sm">Normalize audio levels</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#2a2a2a] bg-[#151515]">
          {isExporting ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Exporting...</span>
                <span className="text-white">{Math.round(exportProgress)}%</span>
              </div>
              <div className="h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#7c3aed] transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Estimated size: ~45 MB
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExport}
                  className="flex items-center gap-2 bg-[#7c3aed] hover:bg-[#6d28d9] px-6 py-2 rounded-lg text-sm transition"
                >
                  <Download className="w-4 h-4" />
                  <span>Export</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

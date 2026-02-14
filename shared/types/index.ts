// Project types
export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  ownerId?: string;
  media: Media[];
  transcript: Transcript | null;
  timeline: Timeline;
}

// Media types
export interface Media {
  id: string;
  projectId: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  type: 'video' | 'audio' | 'image';
  duration?: number;
  metadata: MediaMetadata;
  createdAt: string;
}

export interface MediaMetadata {
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  bitrate?: number;
  
  // Audio enhancement info
  audioEnhanced?: boolean;
  audioEnhancementStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  originalAudioPath?: string;
  enhancedAudioPath?: string;
  enhancementStats?: AudioEnhancementStats;
}

export interface AudioEnhancementStats {
  noiseReductionLevel: number;      // 0-100
  volumeAdjustment: number;         // dB
  processingTime: number;           // seconds
  provider: 'adobe' | 'ffmpeg' | 'local';
}

export interface MediaFile {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  url: string;
  duration: number;
  size: number;
  thumbnails?: string[];  // Array of thumbnail URLs for timeline
  waveform?: number[];    // Audio waveform data
}

// Transcript types
export interface Transcript {
  id: string;
  mediaId: string;
  language: string;
  segments: TranscriptSegment[];
  createdAt: string;
  updatedAt: string;
  // AI增强功能
  title?: string;              // AI生成的标题
  summary?: string;            // AI生成的摘要
  chapters?: Chapter[];        // AI识别的章节
  speakers?: Speaker[];        // 识别到的说话人
  fillerWordsRemoved?: boolean; // 是否已移除填充词
}

export interface TranscriptSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  speakerId?: string;         // 说话人ID
  speakerName?: string;       // 说话人名称
  words: Word[];
  chapter?: string;           // 所属章节ID
}

export interface Speaker {
  id: string;
  label: string;              // 原始标签 (如 "SPEAKER_00", "SPEAKER_01")
  customName?: string;        // 用户自定义名称 (如 "Alice", "Bob")
  color?: string;             // 头像边框颜色 "#FF6B6B"
  avatarPath?: string;        // 头像文件路径 "/uploads/avatars/xxx.jpg"
  avatarUrl?: string;         // 头像完整URL
  firstAppearance: number;    // 首次出现时间戳 (秒)
  totalDuration: number;      // 总说话时长 (秒)
  segmentCount: number;       // 说话片段数量
}

export interface Chapter {
  id: string;
  title: string;              // 章节标题
  startTime: number;
  endTime: number;
  segmentIds: string[];       // 包含的片段ID列表
}

export interface Word {
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  /** Flag for non-destructive text-driven editing - marks word as deleted/cut */
  deleted?: boolean;
  /** Optional index for unique identification within segment */
  index?: number;
}

// Timeline types
export interface Timeline {
  id: string;
  projectId: string;
  tracks: Track[];
  duration: number;
}

export interface Track {
  id: string;
  type: 'video' | 'audio' | 'caption';
  name: string;
  clips: Clip[];
  muted?: boolean;
  volume?: number;
  locked?: boolean;
}

export interface Clip {
  id: string;
  mediaId: string;
  name: string;
  startTime: number;      // Position on timeline
  duration: number;       // Clip duration
  sourceStart: number;    // Start position in source media
  sourceEnd: number;      // End position in source media
  volume?: number;
  speed?: number;
  effects?: ClipEffect[];
  thumbnails?: string[];  // Thumbnail URLs for this clip
  waveform?: number[];    // Waveform data for audio
}

export interface ClipEffect {
  id: string;
  type: 'fade-in' | 'fade-out' | 'crossfade' | 'speed';
  startTime: number;
  duration: number;
  params?: Record<string, any>;
}

// Export types
export interface ExportJob {
  id: string;
  projectId: string;
  format: 'mp4' | 'webm' | 'gif';
  resolution: '2160p' | '1080p' | '720p' | '480p';
  quality: 'high' | 'medium' | 'low';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  createdAt: string;
  completedAt: string | null;
  outputUrl: string | null;
  error?: string;
}

export interface ExportOptions {
  format: 'mp4' | 'webm' | 'gif';
  resolution: '2160p' | '1080p' | '720p' | '480p';
  quality: 'high' | 'medium' | 'low';
  includeSubtitles?: boolean;
  subtitleStyle?: SubtitleStyle;
}

export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  backgroundColor: string;
  position: 'top' | 'center' | 'bottom';
}

// Transcription types
export interface TranscriptionJob {
  id: string;
  mediaId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  language?: string;
  progress: number;
  createdAt: string;
  completedAt: string | null;
  result?: Transcript;
  error?: string;
}

// Recording types
export interface RecordingSettings {
  videoSource: 'screen' | 'camera' | 'both';
  audioSource: 'microphone' | 'system' | 'both' | 'none';
  quality: 'high' | 'medium' | 'low';
  format: 'webm' | 'mp4';
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

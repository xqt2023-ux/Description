'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Home,
  FolderOpen,
  Zap,
  BookOpen,
  Palette,
  Users,
  LayoutGrid,
  Lock,
  ChevronDown,
  Search,
  Settings,
  HelpCircle,
  Upload,
  Sparkles,
  Video,
  Mic,
  Type,
  Eye,
  Scissors,
  Languages,
  Monitor,
  Play,
  Plus,
  Clock,
  Folder,
  UserPlus,
  FileText,
  Wand2,
  Loader2,
  X,
} from 'lucide-react';
import { mediaApi, aiApi, transcriptionApi, downloadEditedVideo, getUploadUrl } from '@/lib/api';
import TemplateWorkflowCard from '@/components/editor/TemplateWorkflowCard';

export default function HomePage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [promptText, setPromptText] = useState('');
  const [activeNav, setActiveNav] = useState('home');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isValidatingFile, setIsValidatingFile] = useState(false);
  const [fileValidationError, setFileValidationError] = useState<string | null>(null);
  const [fileMediaInfo, setFileMediaInfo] = useState<{
    type: 'video' | 'audio';
    duration?: number;
    width?: number;
    height?: number;
    codec?: string;
    format?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Translate & dub workflow states
  const [showTranslateWorkflow, setShowTranslateWorkflow] = useState(false);
  const [translateFile, setTranslateFile] = useState<File | null>(null);
  const [isProcessingMedia, setIsProcessingMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [uploadedMediaId, setUploadedMediaId] = useState<string | null>(null);
  const [transcriptionJobId, setTranscriptionJobId] = useState<string | null>(null);
  const [transcriptionProgress, setTranscriptionProgress] = useState(0);
  const [transcriptionStatus, setTranscriptionStatus] = useState<'idle' | 'uploading' | 'extracting' | 'transcribing' | 'completed' | 'error'>('idle');
  const [workflowMessages, setWorkflowMessages] = useState<Array<{type: 'assistant' | 'user' | 'status' | 'task', content: string, taskStatus?: string}>>([]);
  const translateFileInputRef = useRef<HTMLInputElement>(null);
  
  // AI Edit workflow states
  const [aiInput, setAiInput] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [editTasks, setEditTasks] = useState<Array<{
    id: string;
    type: string;
    name: string;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: string;
    error?: string;
  }>>([]);
  const [workflowType, setWorkflowType] = useState<'translate' | 'general'>('translate');

  // Video Edit Orchestration states
  const [orchestrationStatus, setOrchestrationStatus] = useState<'idle' | 'planning' | 'awaiting_confirmation' | 'executing' | 'completed' | 'error'>('idle');
  const [editPlan, setEditPlan] = useState<{
    planId: string;
    operations: Array<{
      type: string;
      description: string;
      parameters: any;
      estimatedDuration?: number;
    }>;
    summary: string;
  } | null>(null);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [orchestrationProgress, setOrchestrationProgress] = useState(0);
  const [outputVideoUrl, setOutputVideoUrl] = useState<string | null>(null);
  const [outputVideoFilename, setOutputVideoFilename] = useState<string | null>(null);
  const [mediaMetadata, setMediaMetadata] = useState<{ duration: number; hasAudio: boolean; width?: number; height?: number } | null>(null);
  const [ffmpegCommand, setFfmpegCommand] = useState<string | null>(null);

  // Media list states
  const [mediaList, setMediaList] = useState<Array<{
    id: string;
    originalName: string;
    filePath: string;
    thumbnailPath?: string;
    duration?: number;
    width?: number;
    height?: number;
    createdAt: string;
  }>>([]);
  const [isLoadingMedia, setIsLoadingMedia] = useState(true);
  
  // Template expansion state
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  // Fetch media list function (extracted for reuse)
  const fetchMediaList = async () => {
    try {
      setIsLoadingMedia(true);
      const response = await mediaApi.getAll();
      if (response.data.success && response.data.data) {
        setMediaList(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch media:', error);
    } finally {
      setIsLoadingMedia(false);
    }
  };

  // Fetch media list on mount
  useEffect(() => {
    fetchMediaList();
  }, []);

  const handleNewProject = () => {
    router.push('/editor/new');
  };

  // 选择文件（不上传，不转录）- 使用后端 FFprobe 验证
  const handleFileSelect = async (files: FileList | null) => {
    console.log('[handleFileSelect] called with files:', files);
    if (!files || files.length === 0) {
      console.log('[handleFileSelect] No files provided');
      return;
    }

    const file = files[0];
    console.log('[handleFileSelect] Processing file:', file.name, 'type:', file.type, 'size:', file.size);

    // 重置状态
    setSelectedFile(null);
    setFileValidationError(null);
    setFileMediaInfo(null);
    setIsValidatingFile(true);

    try {
      // 调用后端 API 使用 FFprobe 验证文件
      console.log('[handleFileSelect] Calling backend validation API...');
      const response = await mediaApi.validate(file);
      const result = response.data;

      console.log('[handleFileSelect] Validation result:', result);

      if (result.valid && (result.type === 'video' || result.type === 'audio')) {
        // 文件有效
        setSelectedFile(file);
        setFileMediaInfo({
          type: result.type,
          duration: result.duration,
          width: result.width,
          height: result.height,
          codec: result.codec,
          format: result.format,
        });
        console.log('[handleFileSelect] File validated successfully:', result.type);
      } else {
        // 文件无效
        const errorMsg = result.error || '该文件不是有效的视频或音频文件';
        setFileValidationError(errorMsg);
        console.log('[handleFileSelect] File validation failed:', errorMsg);
        alert(errorMsg);
      }
    } catch (error: any) {
      console.error('[handleFileSelect] Validation API error:', error);
      const errorMsg = error.response?.data?.error || error.message || '文件验证失败，请重试';
      setFileValidationError(errorMsg);
      alert(errorMsg);
    } finally {
      setIsValidatingFile(false);
    }
  };

  // 移除选中的文件
  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFileValidationError(null);
    setFileMediaInfo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 点击 Get started 时跳转到编辑器（带上文件信息）
  const handleGetStarted = () => {
    if (selectedFile) {
      // 将文件存储到 sessionStorage，然后跳转
      // 由于文件对象不能直接序列化，我们使用一个标记
      sessionStorage.setItem('pendingFile', JSON.stringify({
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type,
      }));
      // 存储实际文件到全局变量（临时方案）
      (window as any).__pendingFile = selectedFile;
      router.push('/editor/new?hasFile=true');
    } else {
      router.push('/editor/new');
    }
  };

  // 点击上传按钮
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // 拖拽事件
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
    handleFileSelect(e.dataTransfer.files);
  };

  // Translate & dub workflow handlers
  const handleTranslateClick = () => {
    setShowTranslateWorkflow(true);
    setWorkflowType('translate');
    setWorkflowMessages([]);
    // 如果首页已经选择了文件，使用该文件
    if (selectedFile) {
      setTranslateFile(selectedFile);
      setWorkflowMessages([
        { type: 'assistant', content: "I'll help you edit your video. Let me start by adding your file to the composition." },
        { type: 'status', content: 'File ready for processing...' },
      ]);
    } else {
      setTranslateFile(null);
    }
    setIsProcessingMedia(false);
    setUploadProgress(0);
    setUploadedBytes(0);
    setTotalBytes(0);
    setUploadedMediaId(null);
    setTranscriptionJobId(null);
    setTranscriptionProgress(0);
    setTranscriptionStatus('idle');
    setEditTasks([]);
    setAiInput('');
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // 开始处理文件：上传 + 转录
  const handleStartProcessing = async () => {
    const fileToProcess = translateFile;
    if (!fileToProcess) return;

    setIsProcessingMedia(true);
    setTranscriptionStatus('uploading');
    setUploadProgress(0);
    setUploadedBytes(0);
    setTotalBytes(fileToProcess.size);
    
    setWorkflowMessages([
      { type: 'assistant', content: "I'll help you edit your video. Let me start by uploading and transcribing your file." },
      { type: 'status', content: `Uploading ${fileToProcess.name}...` },
    ]);

    try {
      // Step 1: 上传文件
      const formData = new FormData();
      formData.append('file', fileToProcess);

      const uploadResponse = await mediaApi.upload(formData, {
        onUploadProgress: (progressEvent: any) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentCompleted);
            setUploadedBytes(progressEvent.loaded);
            setTotalBytes(progressEvent.total);
          }
        },
      });

      if (!uploadResponse.data.success) {
        throw new Error(uploadResponse.data.error || 'Upload failed');
      }

      const mediaId = uploadResponse.data.data.id;
      const filePath = uploadResponse.data.data.filePath;
      setUploadedMediaId(mediaId);

      // Refresh media list after successful upload
      fetchMediaList();

      setWorkflowMessages(prev => [
        ...prev.filter(m => m.type !== 'status'),
        { type: 'status', content: 'Upload complete! Extracting audio...' },
      ]);
      setTranscriptionStatus('extracting');

      // Step 2: 启动转录任务
      const transcriptionResponse = await transcriptionApi.startJob(mediaId, filePath);
      
      if (!transcriptionResponse.data.success) {
        throw new Error(transcriptionResponse.data.error || 'Failed to start transcription');
      }

      const jobId = transcriptionResponse.data.data.jobId;
      setTranscriptionJobId(jobId);
      setTranscriptionStatus('transcribing');
      
      setWorkflowMessages(prev => [
        ...prev.filter(m => m.type !== 'status'),
        { type: 'status', content: 'Transcribing audio...' },
      ]);

      // Step 3: 轮询转录状态
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await transcriptionApi.getJobStatus(jobId);
          const status = statusResponse.data.data;

          if (status.progress) {
            setTranscriptionProgress(status.progress);
          }

          if (status.status === 'completed') {
            clearInterval(pollInterval);
            setTranscriptionStatus('completed');
            setIsProcessingMedia(false);
            setWorkflowMessages(prev => [
              ...prev.filter(m => m.type !== 'status'),
              { type: 'assistant', content: "✅ Media uploaded and transcribed successfully! Now tell me what you'd like to do with it. For example:" },
              { type: 'assistant', content: "• \"Translate to Chinese\"\n• \"Remove filler words and improve clarity\"\n• \"Generate social media posts\"\n• \"Create chapter markers\"" },
            ]);
          } else if (status.status === 'failed') {
            clearInterval(pollInterval);
            setTranscriptionStatus('error');
            setIsProcessingMedia(false);
            setWorkflowMessages(prev => [
              ...prev.filter(m => m.type !== 'status'),
              { type: 'assistant', content: `❌ Transcription failed: ${status.error || 'Unknown error'}. You can still proceed with manual editing.` },
            ]);
          }
        } catch (pollError) {
          console.error('Polling error:', pollError);
        }
      }, 2000);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (transcriptionStatus === 'transcribing') {
          setTranscriptionStatus('error');
          setIsProcessingMedia(false);
          setWorkflowMessages(prev => [
            ...prev.filter(m => m.type !== 'status'),
            { type: 'assistant', content: '⏱️ Transcription is taking longer than expected. You can check back later or proceed with manual editing.' },
          ]);
        }
      }, 300000);

    } catch (error: any) {
      console.error('Processing error:', error);
      setTranscriptionStatus('error');
      setIsProcessingMedia(false);
      setWorkflowMessages(prev => [
        ...prev.filter(m => m.type !== 'status'),
        { type: 'assistant', content: `❌ Error: ${error.message || 'Failed to process media'}` },
      ]);
    }
  };

  const handleTranslateFileSelect = async (files: FileList | null) => {
    console.log('handleTranslateFileSelect called', files);
    if (!files || files.length === 0) {
      console.log('No files selected');
      return;
    }

    const file = files[0];
    console.log('File selected:', file.name, file.type, file.size);

    // 验证文件类型 - 通过 MIME 类型或扩展名
    const isValidByType = file.type.startsWith('video/') || file.type.startsWith('audio/');
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const validExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v', 'mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac', 'wma'];
    const isValidByExtension = validExtensions.includes(ext);

    if (!isValidByType && !isValidByExtension) {
      alert('请上传视频或音频文件');
      return;
    }

    // 只设置文件，不自动开始处理
    setTranslateFile(file);
    setTranscriptionStatus('idle');
    setWorkflowMessages([
      { type: 'assistant', content: "I'll help you edit your video. Click 'Start Processing' to upload and transcribe your file." },
      { type: 'status', content: 'File ready for processing...' },
    ]);
  };

  // Handle AI edit request - parse user's video editing requirements and show plan for confirmation
  const handleAiEditRequest = async () => {
    if (!aiInput.trim() || isPlanning || isExecuting) return;
    if (!uploadedMediaId) {
      setWorkflowMessages(prev => [
        ...prev,
        { type: 'assistant', content: '⚠️ Please upload a video first before requesting edits.' },
      ]);
      return;
    }

    const userRequest = aiInput.trim();
    setAiInput('');
    setIsPlanning(true);
    setOrchestrationStatus('planning');

    // Add user message
    setWorkflowMessages(prev => [
      ...prev,
      { type: 'user', content: userRequest },
      { type: 'status', content: '🔍 Analyzing your request and planning video editing tasks...' },
    ]);

    try {
      // Get media metadata if not already set
      let metadata = mediaMetadata;
      if (!metadata) {
        try {
          const mediaResponse = await mediaApi.getById(uploadedMediaId);
          if (mediaResponse.data.success && mediaResponse.data.data) {
            const mediaData = mediaResponse.data.data;
            metadata = {
              duration: mediaData.duration || 60,
              hasAudio: true,
              width: mediaData.width,
              height: mediaData.height,
            };
            setMediaMetadata(metadata);
          }
        } catch (e) {
          metadata = { duration: 60, hasAudio: true };
          setMediaMetadata(metadata);
        }
      }

      // Call orchestration API with autoExecute=false to get plan only
      const response = await aiApi.orchestrateEdit(
        userRequest,
        uploadedMediaId,
        metadata!,
        false // autoExecute = false, wait for confirmation
      );

      if (response.data.success) {
        const { parsedRequest, plan } = response.data.data;
        const instructions = plan?.instructions || [];
        const planId = plan?.id || '';

        // Clear status message
        setWorkflowMessages(prev => prev.filter(m => m.type !== 'status'));

        // Show AI understanding of the request
        setWorkflowMessages(prev => [
          ...prev,
          {
            type: 'assistant',
            content: `📋 **Task Analysis**\n\n**Intent:** ${parsedRequest?.intent || 'video edit'}\n**Confidence:** ${Math.round((parsedRequest?.confidence || 0) * 100)}%\n**Tool:** 🎬 FFmpeg (video processing)\n\n**Planned Steps:**`
          },
        ]);

        // Update plan state
        setEditPlan({
          planId: planId,
          operations: instructions.map((inst: any) => ({
            type: inst.type,
            description: inst.description,
            parameters: inst.params,
          })),
          summary: `${parsedRequest?.intent || 'Video edit'} - ${instructions.length} steps`,
        });

        // Add task items with tool indicator
        if (instructions.length > 0) {
          instructions.forEach((inst: any, idx: number) => {
            setWorkflowMessages(prev => [
              ...prev,
              {
                type: 'task',
                content: `${idx + 1}. [FFmpeg] ${inst.description || inst.type}`,
                taskStatus: 'pending'
              },
            ]);
          });
        }

        // Set pending plan for confirmation
        setPendingPlanId(planId);
        setIsPlanning(false);
        setOrchestrationStatus('awaiting_confirmation');

        // Show confirmation prompt
        setWorkflowMessages(prev => [
          ...prev,
          {
            type: 'assistant',
            content: '⏳ **Waiting for confirmation...**\n\nPlease review the plan above. Click **Confirm** to execute or **Cancel** to abort.'
          },
        ]);
      } else {
        throw new Error(response.data.error || 'Failed to process video editing request');
      }
    } catch (error: any) {
      console.error('Video edit orchestration error:', error);
      setOrchestrationStatus('error');
      setWorkflowMessages(prev => [
        ...prev.filter(m => m.type !== 'status'),
        {
          type: 'assistant',
          content: `❌ **Error:** ${error.message || 'Failed to process your request'}\n\nTry rephrasing your request or use simpler commands like:\n• "Cut the first 5 seconds"\n• "Speed up 2x"\n• "Add blur effect"\n• "Trim from 10 to 30 seconds"`
        },
      ]);
    } finally {
      setIsPlanning(false);
    }
  };

  // Confirm and execute the pending plan
  const handleConfirmPlan = async () => {
    if (!pendingPlanId || isExecuting) return;

    setOrchestrationStatus('executing');
    setIsExecuting(true);

    // Remove confirmation message and update status
    setWorkflowMessages(prev => [
      ...prev.filter(m => !m.content.includes('Waiting for confirmation')),
      { type: 'status', content: '🚀 Executing video edit tasks...' },
    ]);

    try {
      const response = await aiApi.executePlan(pendingPlanId);

      if (response.data.success) {
        const executionResult = response.data.data;
        const instructions = editPlan?.operations || [];
        const totalSteps = executionResult.totalSteps || instructions.length;
        const executedSteps = executionResult.executedSteps || totalSteps;

        // Clear status message
        setWorkflowMessages(prev => prev.filter(m => m.type !== 'status'));

        // Show FFmpeg command
        if (executionResult.ffmpegCommand) {
          setFfmpegCommand(executionResult.ffmpegCommand);
          setWorkflowMessages(prev => [
            ...prev,
            {
              type: 'assistant',
              content: `🔧 **Executing FFmpeg Command:**\n\`\`\`bash\n${executionResult.ffmpegCommand}\n\`\`\``
            },
          ]);
        }

        // Update task statuses progressively
        for (let idx = 0; idx < Math.min(executedSteps, instructions.length); idx++) {
          setTimeout(() => {
            setWorkflowMessages(prev => prev.map((m) => {
              if (m.type === 'task' && m.content.includes(`${idx + 1}.`)) {
                return { ...m, taskStatus: 'completed' };
              }
              return m;
            }));
            setOrchestrationProgress(Math.round(((idx + 1) / totalSteps) * 100));
          }, (idx + 1) * 300);
        }

        // Check execution result
        if (executionResult.success && executionResult.outputPath) {
          const filename = executionResult.outputPath.split(/[/\\]/).pop() || 'edited-video.mp4';
          setOutputVideoFilename(filename);
          const downloadUrl = executionResult.downloadUrl || downloadEditedVideo(filename);
          setOutputVideoUrl(downloadUrl);

          setTimeout(() => {
            setOrchestrationStatus('completed');
            setOrchestrationProgress(100);
            setIsExecuting(false);
            setPendingPlanId(null);
            setWorkflowMessages(prev => [
              ...prev,
              {
                type: 'assistant',
                content: `✅ **Video editing completed!**\n\nYour edited video is ready for download.\n📁 Output: \`${filename}\`\n\nYou can continue with more editing requests or download your video.`
              },
            ]);
          }, Math.min(executedSteps, instructions.length) * 300 + 500);
        } else if (!executionResult.success) {
          setOrchestrationStatus('error');
          setIsExecuting(false);
          setPendingPlanId(null);
          setWorkflowMessages(prev => [
            ...prev,
            {
              type: 'assistant',
              content: `❌ **Processing failed:** ${executionResult.error || 'Unknown error'}\n\nPlease try a different request or check your video file.`
            },
          ]);
        }
      } else {
        throw new Error(response.data.error || 'Failed to execute plan');
      }
    } catch (error: any) {
      console.error('Plan execution error:', error);
      setOrchestrationStatus('error');
      setIsExecuting(false);
      setPendingPlanId(null);
      setWorkflowMessages(prev => [
        ...prev.filter(m => m.type !== 'status'),
        {
          type: 'assistant',
          content: `❌ **Execution failed:** ${error.message || 'Failed to execute plan'}`
        },
      ]);
    }
  };

  // Cancel the pending plan
  const handleCancelPlan = () => {
    setPendingPlanId(null);
    setOrchestrationStatus('idle');
    setEditPlan(null);
    setWorkflowMessages(prev => [
      ...prev.filter(m => !m.content.includes('Waiting for confirmation')),
      {
        type: 'assistant',
        content: '❌ **Plan cancelled.** You can enter a new request.'
      },
    ]);
  };

  const handleBackToHome = () => {
    setShowTranslateWorkflow(false);
    setTranslateFile(null);
    setWorkflowMessages([]);
    setIsProcessingMedia(false);
    setUploadProgress(0);
    setEditTasks([]);
    setAiInput('');
    setOrchestrationStatus('idle');
    setEditPlan(null);
    setOrchestrationProgress(0);
    setOutputVideoUrl(null);
    setOutputVideoFilename(null);
    setFfmpegCommand(null);
    setPendingPlanId(null);
  };

  // Handle Translate & Dub workflow button click
  const handleTranslateDubClick = async () => {
    if (!uploadedMediaId || transcriptionStatus !== 'completed') {
      setWorkflowMessages(prev => [
        ...prev,
        { type: 'assistant', content: '⚠️ Please wait for the media to be uploaded and transcribed first.' },
      ]);
      return;
    }

    setOrchestrationStatus('planning');
    setWorkflowMessages(prev => [
      ...prev,
      { type: 'user', content: 'Translate & dub this video' },
      { type: 'status', content: 'Analyzing video and planning translation tasks...' },
    ]);

    try {
      // Get media metadata if not already set
      let metadata = mediaMetadata;
      if (!metadata) {
        try {
          const mediaResponse = await mediaApi.getById(uploadedMediaId);
          if (mediaResponse.data.success && mediaResponse.data.data) {
            const mediaData = mediaResponse.data.data;
            metadata = {
              duration: mediaData.duration || 60,
              hasAudio: true,
              width: mediaData.width,
              height: mediaData.height,
            };
            setMediaMetadata(metadata);
          }
        } catch (e) {
          // Use default values
          metadata = { duration: 60, hasAudio: true };
          setMediaMetadata(metadata);
        }
      }

      // Call orchestration API with translate request
      const response = await aiApi.orchestrateEdit(
        'Translate this video to Chinese with dubbed audio. Extract the transcript, translate it, and generate a new audio track.',
        uploadedMediaId,
        metadata!,
        true // autoExecute
      );

      if (response.data.success) {
        const { parsedRequest, plan, executionResult } = response.data.data;

        // Update plan state - map backend structure to frontend
        const instructions = plan?.instructions || [];
        setEditPlan({
          planId: plan?.id || '',
          operations: instructions.map((inst: any) => ({
            type: inst.type,
            description: inst.description,
            parameters: inst.params,
          })),
          summary: `${parsedRequest?.intent || 'Video edit'} workflow - ${instructions.length} steps`,
        });

        // Clear status message
        setWorkflowMessages(prev => prev.filter(m => m.type !== 'status'));

        // Show plan summary
        setWorkflowMessages(prev => [
          ...prev,
          { type: 'assistant', content: `📋 **Edit Plan Created**\n\nIntent: ${parsedRequest?.intent || 'video edit'}\nConfidence: ${Math.round((parsedRequest?.confidence || 0) * 100)}%\nSteps: ${instructions.length}` },
        ]);

        // Add task items to display
        if (instructions.length > 0) {
          instructions.forEach((inst: any, idx: number) => {
            setWorkflowMessages(prev => [
              ...prev,
              { type: 'task', content: `${idx + 1}. ${inst.description || inst.type}`, taskStatus: 'pending' },
            ]);
          });
        }

        setOrchestrationStatus('executing');

        // If auto-execute is enabled, show execution results
        if (executionResult) {
          const totalSteps = executionResult.totalSteps || instructions.length;
          const executedSteps = executionResult.executedSteps || 0;

          // Capture FFmpeg command for display
          if (executionResult.ffmpegCommand) {
            setFfmpegCommand(executionResult.ffmpegCommand);
            setWorkflowMessages(prev => [
              ...prev,
              { type: 'assistant', content: `🔧 **FFmpeg Command:**\n\`\`\`bash\n${executionResult.ffmpegCommand}\n\`\`\`` },
            ]);
          }

          // Update task statuses progressively
          for (let idx = 0; idx < Math.min(executedSteps, instructions.length); idx++) {
            const inst = instructions[idx];
            setTimeout(() => {
              setWorkflowMessages(prev => prev.map((m) => {
                if (m.type === 'task' && m.content.startsWith(`${idx + 1}.`)) {
                  return { ...m, taskStatus: 'completed' };
                }
                return m;
              }));
              setOrchestrationProgress(Math.round(((idx + 1) / totalSteps) * 100));
            }, (idx + 1) * 500);
          }

          // Check execution result
          if (executionResult.success && executionResult.outputPath) {
            const filename = executionResult.outputPath.split(/[/\\]/).pop() || 'edited-video.mp4';
            setOutputVideoFilename(filename);
            // Use downloadUrl if available, otherwise construct from outputPath
            const downloadUrl = executionResult.downloadUrl || downloadEditedVideo(filename);
            setOutputVideoUrl(downloadUrl);

            setTimeout(() => {
              setOrchestrationStatus('completed');
              setOrchestrationProgress(100);
              setWorkflowMessages(prev => [
                ...prev,
                { type: 'assistant', content: `✅ **Video processing completed!**\n\nYour edited video is ready for download.\nOutput: ${filename}` },
              ]);
            }, Math.min(executedSteps, instructions.length) * 500 + 500);
          } else if (!executionResult.success) {
            setOrchestrationStatus('error');
            setWorkflowMessages(prev => [
              ...prev,
              { type: 'assistant', content: `❌ **Processing failed**: ${executionResult.error || 'Unknown error'}` },
            ]);
          }
        } else {
          // No execution result yet - plan was created but not executed
          setWorkflowMessages(prev => [
            ...prev,
            { type: 'assistant', content: '⏳ Plan created. Waiting for execution...' },
          ]);
        }
      } else {
        throw new Error(response.data.error || 'Failed to create edit plan');
      }
    } catch (error: any) {
      console.error('Orchestration error:', error);
      setOrchestrationStatus('error');
      setWorkflowMessages(prev => [
        ...prev.filter(m => m.type !== 'status'),
        { type: 'assistant', content: `❌ Error: ${error.message || 'Failed to process video'}. Please try again.` },
      ]);
    }
  };

  // 格式化文件名（超长时截断）
  const formatFileName = (name: string, maxLength: number = 20) => {
    if (name.length <= maxLength) return name;
    const ext = name.split('.').pop() || '';
    const baseName = name.slice(0, name.length - ext.length - 1);
    const truncatedBase = baseName.slice(0, maxLength - ext.length - 4);
    return `${truncatedBase}...${ext}`;
  };

  // Template workflow definitions
  const templateWorkflows = {
    'clean-up': {
      icon: Scissors,
      label: 'Clean up video recording',
      setup: 'First, ask me to provide a file if there isn\'t already one in the project.\n\nOnce I\'ve provided a file, proceed with creating a plan for my workflow:',
      workflow: [
        'Edit the script to remove retakes, remove excessive filler words, shorten long pauses, and make light edits for clarity.',
        'Clean up the audio by applying Studio Sound.',
        'Add scenes and layouts at key moments. Be sure to include an intro. Fill b-roll with stock media.',
        'Apply subtle zooms to hide jump cuts.'
      ],
      completion: 'After completing the workflow, suggest more relevant edits.'
    },
    'avatar': {
      icon: Users,
      label: 'Generate with an avatar',
      setup: 'First, I\'ll need you to provide a script or transcript for your video.\n\nOnce you\'ve provided the content, I\'ll create a plan to:',
      workflow: [
        'Select an AI avatar that matches your style and tone.',
        'Generate natural voice narration synchronized with the avatar.',
        'Add relevant gestures and facial expressions to make it engaging.',
        'Include branded elements like logos and background.',
        'Apply smooth transitions between scenes.'
      ],
      completion: 'After generating the video, I can help you adjust the avatar style or voice if needed.'
    },
    'podcast': {
      icon: Wand2,
      label: 'Rough cut of podcast',
      setup: 'First, provide your podcast recording file.\n\nThen I\'ll prepare a rough cut workflow:',
      workflow: [
        'Identify and label all speakers automatically.',
        'Remove long pauses and dead air (over 2 seconds).',
        'Delete filler words (um, uh, like, you know) to tighten the pace.',
        'Apply audio leveling to balance speaker volumes.',
        'Generate chapter markers for key topics discussed.',
        'Add intro/outro music if desired.'
      ],
      completion: 'After the rough cut, I can help with fine-tuning or creating social media clips from highlights.'
    },
    'social-clips': {
      icon: Video,
      label: 'Create social clips',
      setup: 'Provide a video file, and I\'ll analyze it to find the best moments.\n\nMy workflow will include:',
      workflow: [
        'Analyze content to identify engaging highlights and key moments.',
        'Extract 3-5 clips optimized for social media (15-60 seconds each).',
        'Resize to vertical format (9:16) for TikTok, Instagram, YouTube Shorts.',
        'Add animated captions with eye-catching styles.',
        'Apply trending music and sound effects.',
        'Generate hooks and CTAs for each clip.'
      ],
      completion: 'I\'ll provide all clips ready to publish, along with suggested captions and hashtags.'
    },
    'slides': {
      icon: Monitor,
      label: 'Turn slides into video',
      setup: 'Upload your PowerPoint or PDF presentation file.\n\nI\'ll then create a video workflow:',
      workflow: [
        'Extract all slides and analyze the content structure.',
        'Generate a natural narration script for each slide.',
        'Create AI voiceover that explains each point clearly.',
        'Add smooth transitions between slides.',
        'Synchronize timing so narration matches slide content.',
        'Include background music and professional intro/outro.'
      ],
      completion: 'Your presentation video will be ready to share or upload to your learning platform.'
    },
    'animated': {
      icon: Play,
      label: 'Generate animated video',
      setup: 'Tell me what video you want to create - just describe your idea or paste a script.\n\nI\'ll build a complete video with:',
      workflow: [
        'Analyze your concept and break it into scenes.',
        'Select relevant stock footage, images, and animations.',
        'Generate professional voiceover narration.',
        'Add animated text overlays and motion graphics.',
        'Apply transitions, effects, and background music.',
        'Include branded elements like logos and colors.'
      ],
      completion: 'You\'ll have a polished animated video ready to publish in minutes, not hours.'
    }
  };

  const quickActions = [
    { ...templateWorkflows['clean-up'], id: 'clean-up' },
    { ...templateWorkflows['avatar'], id: 'avatar' },
    { ...templateWorkflows['podcast'], id: 'podcast' },
    { ...templateWorkflows['social-clips'], id: 'social-clips' },
    { id: 'translate', icon: Languages, label: 'Translate & dub video', action: handleTranslateClick, special: true },
    { ...templateWorkflows['slides'], id: 'slides' },
    { ...templateWorkflows['animated'], id: 'animated' },
  ];

  const popularFeatures = [
    {
      icon: Sparkles,
      title: 'AI video maker',
      description: 'Watch AI make your video with voiceover and visuals',
      hasPreview: true,
    },
    {
      icon: Users,
      title: 'Create with AI speaker',
      description: 'Let an avatar present your script',
    },
    {
      icon: FileText,
      title: 'Transcribe',
      description: 'Accurate, fast, across twenty-five languages',
    },
    {
      icon: Type,
      title: 'Captions',
      description: 'Add subtitles to extend your reach',
    },
    {
      icon: Eye,
      title: 'Eye contact',
      description: 'Fix eye gaze so you always look at the camera',
    },
  ];

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  // 自动上传和转录：只要进入工作流且有 translateFile 且未处理，自动触发
  useEffect(() => {
    if (showTranslateWorkflow && translateFile && transcriptionStatus === 'idle' && !isProcessingMedia) {
      handleStartProcessing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTranslateWorkflow, translateFile]);

  // Translate & Dub Workflow View
  if (showTranslateWorkflow) {
    return (
      <div className="h-screen flex bg-gray-50">
        {/* Left Sidebar - Same as main page */}
        <aside className="w-56 bg-[#1a1625] flex flex-col text-white flex-shrink-0">
          <div className="p-3">
            <button 
              onClick={handleBackToHome}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/10 transition"
            >
              <Home className="w-5 h-5" />
              <span className="text-sm">Home</span>
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">Project plan</span>
              <button 
                onClick={() => {
                  if (translateFile) {
                    sessionStorage.setItem('pendingFile', JSON.stringify({
                      name: translateFile.name,
                      size: translateFile.size,
                      type: translateFile.type,
                    }));
                    (window as any).__pendingFile = translateFile;
                    router.push('/editor/new?hasFile=true&workflow=translate');
                  } else {
                    // 没有文件时也可以跳转到编辑器，传递 workflow 参数
                    router.push('/editor/new?workflow=translate');
                  }
                }}
                className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
              >
                <span>→</span>
                <span>Continue in editor</span>
              </button>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm text-gray-500">
                <Clock className="w-4 h-4" />
                <span>8</span>
                <div className="w-4 h-4 rounded-full border-2 border-gray-400 flex items-center justify-center text-[10px]">⏱</div>
                <span>55m</span>
              </div>
              <button className="px-4 py-1.5 text-sm font-medium text-purple-600 border border-purple-600 rounded-full hover:bg-purple-50 transition">
                Upgrade
              </button>
              <button className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition">
                Export
              </button>
              <button className="p-2 text-gray-400 hover:text-gray-600">
                <HelpCircle className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* Main Content Area */}
          <main className="flex-1 overflow-auto flex">
            {/* Center Content */}
            <div className="flex-1 flex flex-col items-center pt-12 px-8">
              <h1 className="text-2xl font-semibold text-gray-900 mb-6">
                What do you want to do?
              </h1>

              {/* Translate & dub option */}
              <button
                onClick={handleTranslateDubClick}
                disabled={transcriptionStatus !== 'completed' || orchestrationStatus === 'planning' || orchestrationStatus === 'executing' || orchestrationStatus === 'awaiting_confirmation'}
                className={`w-full max-w-xl flex items-center justify-between px-6 py-4 rounded-xl mb-8 transition ${
                  transcriptionStatus === 'completed' && orchestrationStatus === 'idle'
                    ? 'bg-purple-100 hover:bg-purple-200 border-2 border-purple-300'
                    : orchestrationStatus === 'completed'
                    ? 'bg-green-100 border-2 border-green-300'
                    : orchestrationStatus === 'awaiting_confirmation'
                    ? 'bg-yellow-100 border-2 border-yellow-300'
                    : 'bg-gray-100 hover:bg-gray-200'
                } ${transcriptionStatus !== 'completed' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-3">
                  {orchestrationStatus === 'planning' || orchestrationStatus === 'executing' ? (
                    <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
                  ) : orchestrationStatus === 'completed' ? (
                    <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : orchestrationStatus === 'awaiting_confirmation' ? (
                    <span className="text-lg">⏳</span>
                  ) : (
                    <Languages className="w-5 h-5 text-gray-600" />
                  )}
                  <span className={`font-medium ${orchestrationStatus === 'completed' ? 'text-green-700' : orchestrationStatus === 'awaiting_confirmation' ? 'text-yellow-700' : 'text-gray-700'}`}>
                    {orchestrationStatus === 'planning' ? 'Planning tasks...' :
                     orchestrationStatus === 'executing' ? `Executing... ${orchestrationProgress}%` :
                     orchestrationStatus === 'completed' ? 'Translation completed!' :
                     orchestrationStatus === 'awaiting_confirmation' ? 'Waiting for confirmation...' :
                     'Translate & dub video'}
                  </span>
                </div>
                <span className="text-gray-400">
                  {transcriptionStatus !== 'completed' ? '🔒' : '›'}
                </span>
              </button>

              {/* Hidden file input - always rendered to maintain ref */}
              <input
                ref={translateFileInputRef}
                type="file"
                accept="video/*,audio/*"
                onChange={(e) => {
                  console.log('File input onChange triggered', e.target.files);
                  handleTranslateFileSelect(e.target.files);
                  // Reset input value to allow selecting the same file again
                  e.target.value = '';
                }}
                className="hidden"
              />

              {/* File upload area */}
              {!translateFile ? (
                <div 
                  className="w-full max-w-xl border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition"
                  onClick={() => {
                    console.log('Upload area clicked, ref:', translateFileInputRef.current);
                    translateFileInputRef.current?.click();
                  }}
                >
                  <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600 font-medium mb-1">Upload a video or audio file</p>
                  <p className="text-sm text-gray-400">Click to browse or drag and drop</p>
                </div>
              ) : (
                <div className="w-full max-w-xl">
                  {/* File card */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl mb-6">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                      {isProcessingMedia ? (
                        <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
                      ) : (
                        <Video className="w-5 h-5 text-gray-500" />
                      )}
                    </div>
                    <span className="text-sm text-gray-700">{translateFile.name}</span>
                    {!isProcessingMedia && (
                      <span className="text-xs text-green-600 ml-auto">✓ Ready</span>
                    )}
                  </div>

                  {/* Chat messages */}
                  <div className="space-y-4 mb-6 max-h-[400px] overflow-y-auto">
                    {workflowMessages.map((msg, idx) => (
                      <div key={idx}>
                        {msg.type === 'user' && (
                          <div className="flex justify-end">
                            <div className="bg-purple-600 text-white px-4 py-2 rounded-xl rounded-br-sm max-w-[80%]">
                              <p className="text-sm">{msg.content}</p>
                            </div>
                          </div>
                        )}
                        {msg.type === 'assistant' && (
                          <div className="flex gap-2">
                            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-lg">🤖</span>
                            </div>
                            <div className="bg-gray-100 px-4 py-2 rounded-xl rounded-bl-sm max-w-[80%]">
                              {msg.content.includes('```') ? (
                                // Render code blocks specially
                                <div className="text-sm text-gray-700">
                                  {msg.content.split(/(```[\s\S]*?```)/g).map((part, i) => {
                                    if (part.startsWith('```')) {
                                      const codeContent = part.replace(/```\w*\n?/, '').replace(/```$/, '');
                                      return (
                                        <pre key={i} className="bg-gray-800 text-green-400 p-3 rounded-lg my-2 overflow-x-auto text-xs font-mono">
                                          <code>{codeContent.trim()}</code>
                                        </pre>
                                      );
                                    }
                                    return <span key={i} className="whitespace-pre-wrap">{part}</span>;
                                  })}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{msg.content}</p>
                              )}
                            </div>
                          </div>
                        )}
                        {msg.type === 'status' && (
                          <div className="flex items-center gap-3 py-2 px-4 bg-yellow-50 rounded-lg">
                            <Loader2 className="w-4 h-4 text-yellow-600 animate-spin" />
                            <span className="text-sm text-yellow-700">{msg.content}</span>
                          </div>
                        )}
                        {msg.type === 'task' && (
                          <div className="flex items-center gap-3 py-2 px-4 bg-white border border-gray-200 rounded-lg">
                            {msg.taskStatus === 'pending' && (
                              <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                            )}
                            {msg.taskStatus === 'running' && (
                              <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
                            )}
                            {msg.taskStatus === 'completed' && (
                              <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                                <span className="text-white text-xs">✓</span>
                              </div>
                            )}
                            {msg.taskStatus === 'failed' && (
                              <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                                <span className="text-white text-xs">✕</span>
                              </div>
                            )}
                            <span className={`text-sm ${msg.taskStatus === 'completed' ? 'text-green-700' : msg.taskStatus === 'failed' ? 'text-red-700' : 'text-gray-700'}`}>
                              {msg.content}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Confirm/Cancel buttons when awaiting confirmation */}
                    {orchestrationStatus === 'awaiting_confirmation' && pendingPlanId && (
                      <div className="flex items-center gap-3 py-3 px-4 bg-purple-50 border border-purple-200 rounded-lg">
                        <button
                          onClick={handleConfirmPlan}
                          disabled={isExecuting}
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Confirm & Execute
                        </button>
                        <button
                          onClick={handleCancelPlan}
                          disabled={isExecuting}
                          className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 disabled:bg-gray-100 transition"
                        >
                          <X className="w-4 h-4" />
                          Cancel
                        </button>
                        <span className="text-xs text-purple-600 ml-auto">Review the plan above before executing</span>
                      </div>
                    )}
                  </div>

                  {/* Download Card - Show when orchestration is completed */}
                  {orchestrationStatus === 'completed' && outputVideoUrl && (
                    <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-green-800">Video Ready!</p>
                          <p className="text-sm text-green-600">{outputVideoFilename}</p>
                        </div>
                      </div>
                      <a
                        href={outputVideoUrl}
                        download={outputVideoFilename || 'edited-video.mp4'}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download Edited Video
                      </a>
                      <p className="text-xs text-green-600 mt-2 text-center">
                        Or copy link: <code className="bg-green-100 px-1 rounded">{outputVideoUrl}</code>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Sidebar */}
            <aside className="w-64 border-l border-gray-200 bg-white flex flex-col">
              <div className="flex-1">
                {['Project', 'AI Tools', 'Properties', 'Elements', 'Captions', 'Media'].map((item) => (
                  <button
                    key={item}
                    className="w-full px-4 py-3 text-sm text-gray-500 hover:bg-gray-50 border-b border-gray-100 text-left"
                  >
                    {item}
                  </button>
                ))}
              </div>
              
              {/* Activity section */}
              <div className="border-t border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-gray-900">Activity</span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </div>
                
                {translateFile && (
                  <div className="space-y-3">
                    {/* Upload Progress */}
                    {(transcriptionStatus === 'uploading' || transcriptionStatus === 'idle') && (
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <svg className="w-8 h-8 -rotate-90">
                            <circle
                              cx="16"
                              cy="16"
                              r="14"
                              fill="none"
                              stroke="#e5e7eb"
                              strokeWidth="2"
                            />
                            <circle
                              cx="16"
                              cy="16"
                              r="14"
                              fill="none"
                              stroke="#8b5cf6"
                              strokeWidth="2"
                              strokeDasharray={`${uploadProgress * 0.88} 88`}
                            />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 truncate">
                            {transcriptionStatus === 'uploading' ? 'Uploading' : 'Ready'} {translateFile.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {formatFileSize(uploadedBytes)} / {formatFileSize(totalBytes || translateFile.size)}
                          </p>
                        </div>
                        <span className="text-xs text-gray-500">{Math.round(uploadProgress)}%</span>
                      </div>
                    )}
                    
                    {/* Audio Extraction Progress */}
                    {transcriptionStatus === 'extracting' && (
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700">Extracting audio...</p>
                          <p className="text-xs text-gray-400">Preparing for transcription</p>
                        </div>
                      </div>
                    )}
                    
                    {/* Transcription Progress */}
                    {transcriptionStatus === 'transcribing' && (
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <svg className="w-8 h-8 -rotate-90">
                            <circle
                              cx="16"
                              cy="16"
                              r="14"
                              fill="none"
                              stroke="#e5e7eb"
                              strokeWidth="2"
                            />
                            <circle
                              cx="16"
                              cy="16"
                              r="14"
                              fill="none"
                              stroke="#10b981"
                              strokeWidth="2"
                              strokeDasharray={`${transcriptionProgress * 0.88} 88`}
                            />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700">Transcribing audio...</p>
                          <p className="text-xs text-gray-400">Using AI to convert speech to text</p>
                        </div>
                        <span className="text-xs text-gray-500">{Math.round(transcriptionProgress)}%</span>
                      </div>
                    )}
                    
                    {/* Completed Status */}
                    {transcriptionStatus === 'completed' && (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700">Processing complete!</p>
                          <p className="text-xs text-gray-400">Ready for editing</p>
                        </div>
                      </div>
                    )}
                    
                    {/* Error Status */}
                    {transcriptionStatus === 'error' && (
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                          <X className="w-5 h-5 text-red-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-red-700">Processing failed</p>
                          <p className="text-xs text-gray-400">You can try again or proceed manually</p>
                        </div>
                        <button
                          onClick={handleStartProcessing}
                          className="text-xs text-purple-600 hover:text-purple-700"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                    
                    {/* Start Processing Button */}
                    {transcriptionStatus === 'idle' && !isProcessingMedia && (
                      <button
                        onClick={handleStartProcessing}
                        className="w-full mt-2 px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition flex items-center justify-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        Start Processing
                      </button>
                    )}

                    {/* Video Edit Progress */}
                    {(orchestrationStatus === 'planning' || orchestrationStatus === 'executing') && (
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-200">
                        <div className="relative">
                          <svg className="w-8 h-8 -rotate-90">
                            <circle cx="16" cy="16" r="14" fill="none" stroke="#e5e7eb" strokeWidth="2" />
                            <circle
                              cx="16" cy="16" r="14" fill="none"
                              stroke="#8b5cf6"
                              strokeWidth="2"
                              strokeDasharray={`${orchestrationProgress * 0.88} 88`}
                            />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700">
                            {orchestrationStatus === 'planning' ? 'Planning edit tasks...' : 'Executing video edit...'}
                          </p>
                          <p className="text-xs text-gray-400">FFmpeg processing</p>
                        </div>
                        <span className="text-xs text-gray-500">{orchestrationProgress}%</span>
                      </div>
                    )}

                    {/* Awaiting Confirmation Status */}
                    {orchestrationStatus === 'awaiting_confirmation' && (
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-200">
                        <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center">
                          <span className="text-lg">⏳</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-yellow-700 font-medium">Awaiting confirmation</p>
                          <p className="text-xs text-gray-400">Review plan before executing</p>
                        </div>
                      </div>
                    )}

                    {/* Edit Completed with Download */}
                    {orchestrationStatus === 'completed' && outputVideoUrl && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-green-700 font-medium">Edit complete!</p>
                            <p className="text-xs text-gray-400 truncate">{outputVideoFilename}</p>
                          </div>
                        </div>
                        <a
                          href={outputVideoUrl}
                          download={outputVideoFilename || 'edited-video.mp4'}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download
                        </a>
                        {/* FFmpeg Command Display */}
                        {ffmpegCommand && (
                          <div className="mt-3">
                            <p className="text-xs text-gray-500 mb-1">FFmpeg Command:</p>
                            <div className="bg-gray-800 text-green-400 p-2 rounded text-[10px] font-mono overflow-x-auto max-h-20 overflow-y-auto">
                              {ffmpegCommand}
                            </div>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(ffmpegCommand);
                              }}
                              className="mt-1 text-xs text-purple-600 hover:text-purple-700"
                            >
                              Copy command
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </aside>
          </main>

          {/* Bottom Chat Input */}
          <div className="border-t border-gray-200 bg-white p-4">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-100">
                <span className="text-2xl">🤖</span>
                <input
                  type="text"
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAiEditRequest();
                    }
                  }}
                  placeholder={
                    isProcessingMedia 
                      ? (transcriptionStatus === 'uploading' ? "Uploading..." : transcriptionStatus === 'extracting' ? "Extracting audio..." : transcriptionStatus === 'transcribing' ? "Transcribing..." : "Processing...")
                      : transcriptionStatus === 'completed' 
                        ? "Tell me what you want to do with this video..." 
                        : translateFile 
                          ? "Click 'Start Processing' to upload and transcribe the file..." 
                          : "Upload a file first..."
                  }
                  disabled={isProcessingMedia || transcriptionStatus !== 'completed' || isPlanning || isExecuting}
                  className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder-gray-400 disabled:cursor-not-allowed"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Ask Underlord</span>
                  <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-500 rounded">Beta</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2 px-2">
                <button 
                  onClick={() => translateFileInputRef.current?.click()}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <Upload className="w-4 h-4" />
                </button>
                <button className="p-2 text-gray-400 hover:text-gray-600">
                  <Settings className="w-4 h-4" />
                </button>
                <div className="flex-1" />
                <button 
                  onClick={handleAiEditRequest}
                  disabled={!aiInput.trim() || isProcessingMedia || transcriptionStatus !== 'completed' || isPlanning || isExecuting}
                  className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
                >
                  {isPlanning || isExecuting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Left Sidebar - Dark purple/navy */}
      <aside className="w-56 bg-[#1a1625] flex flex-col text-white flex-shrink-0">
        {/* User Section */}
        <div className="p-3">
          <button className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/10 transition">
            <div className="w-7 h-7 rounded-lg bg-purple-600 flex items-center justify-center text-sm font-medium">
              U
            </div>
            <span className="text-sm font-medium flex-1 truncate text-left">User</span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>
          
          <button className="w-full mt-1 flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition">
            <UserPlus className="w-4 h-4" />
            <span>Invite</span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-2 space-y-0.5">
          <NavItem 
            icon={Home} 
            label="Home" 
            active={activeNav === 'home'}
            onClick={() => setActiveNav('home')}
          />
          <NavItem 
            icon={FolderOpen} 
            label="Projects" 
            active={activeNav === 'projects'}
            onClick={() => setActiveNav('projects')}
          />
          <NavItem 
            icon={Zap} 
            label="Quick recordings" 
            active={activeNav === 'quick'}
            onClick={() => setActiveNav('quick')}
          />
          <NavItem 
            icon={BookOpen} 
            label="Learn Descript" 
            active={activeNav === 'learn'}
            onClick={() => setActiveNav('learn')}
          />
          
          <div className="my-3 border-t border-white/10" />
          
          <NavItem 
            icon={Palette} 
            label="Brand Studio" 
            active={activeNav === 'brand'}
            onClick={() => setActiveNav('brand')}
          />
          <NavItem 
            icon={Users} 
            label="AI speakers" 
            active={activeNav === 'speakers'}
            onClick={() => setActiveNav('speakers')}
          />
          <NavItem 
            icon={LayoutGrid} 
            label="Layout packs" 
            active={activeNav === 'layouts'}
            onClick={() => setActiveNav('layouts')}
          />

          {/* Workspaces */}
          <div className="mt-6 pt-2">
            <p className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Workspaces
            </p>
            <NavItem 
              icon={Lock} 
              label="Private workspace" 
              active={activeNav === 'private'}
              onClick={() => setActiveNav('private')}
            />
            <NavItem 
              icon={Folder} 
              label="My Drive workspace" 
              active={activeNav === 'drive'}
              onClick={() => setActiveNav('drive')}
              badge="x"
            />
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Banner - Upgrade notice */}
        <div className="bg-purple-50 border-b border-purple-100 px-6 py-2.5 text-center text-sm flex-shrink-0">
          <span className="text-gray-600">You're on a </span>
          <span className="font-semibold text-gray-900">Free plan</span>
          <span className="text-gray-600">. Upgrade for more media minutes, AI credits, watermark-free exports, and more. </span>
          <button className="text-purple-600 font-medium border border-purple-600 px-3 py-0.5 rounded hover:bg-purple-100 transition ml-1">
            Upgrade
          </button>
        </div>

        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 flex-shrink-0">
          {/* Search */}
          <div className="flex-1 flex justify-center">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search projects"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-100 border border-transparent rounded-full text-sm focus:outline-none focus:border-purple-400 focus:bg-white transition"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Time/Credits Display */}
            <div className="flex items-center gap-1.5 text-sm text-gray-500 mr-2">
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>21</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 rounded-full border-2 border-gray-400 flex items-center justify-center text-[10px]">⏱</div>
                <span>57m</span>
              </div>
            </div>

            {/* Upgrade Button */}
            <button className="px-4 py-1.5 text-sm font-medium text-purple-600 border border-purple-600 rounded-full hover:bg-purple-50 transition">
              Upgrade
            </button>

            {/* Record Button */}
            <button className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span>Record</span>
            </button>

            {/* New Project Button */}
            <button 
              onClick={handleNewProject}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition"
            >
              New Project
            </button>

            {/* Close/Help buttons */}
            <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Main Content Area - Scrollable */}
        <main className="flex-1 overflow-auto">
          <div className="max-w-4xl mx-auto px-6 py-8">
            {/* AI Assistant Section */}
            <div className="bg-gradient-to-br from-purple-50 via-pink-50 to-orange-50 rounded-2xl p-8 mb-10 relative">
              {/* Header with Robot Icon */}
              <div className="flex items-center justify-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center">
                  <span className="text-xl">🤖</span>
                </div>
                <h1 className="text-2xl font-semibold text-gray-900">
                  What can I help you with?
                </h1>
              </div>

              {/* Template Workflow Cards */}
              <div className="space-y-4 mb-8 w-full">
                {quickActions.map((action) => {
                  // Handle special "Translate & dub" button differently
                  if ('special' in action && action.special) {
                    return (
                      <button
                        key={action.id}
                        onClick={action.action}
                        className="w-full max-w-4xl mx-auto flex items-center gap-3 px-6 py-4 bg-white rounded-xl text-sm text-gray-700 hover:shadow-md transition border border-gray-200 hover:border-gray-300"
                      >
                        <action.icon className="w-5 h-5 text-purple-600" />
                        <span className="font-medium">{action.label}</span>
                      </button>
                    );
                  }
                  
                  // Render template workflow cards
                  if ('setup' in action && 'workflow' in action && 'completion' in action) {
                    return (
                      <TemplateWorkflowCard
                        key={action.id}
                        id={action.id}
                        icon={action.icon}
                        label={action.label}
                        setup={action.setup}
                        workflow={action.workflow}
                        completion={action.completion}
                        isExpanded={expandedTemplate === action.id}
                        onToggle={() => {
                          setExpandedTemplate(expandedTemplate === action.id ? null : action.id);
                        }}
                      />
                    );
                  }
                  
                  return null;
                })}
              </div>

              {/* Input Box */}
              <div 
                className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all ${
                  isDragging ? 'border-purple-500 ring-2 ring-purple-200' : 'border-gray-200'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {/* Hidden file input with id for label association */}
                <input
                  ref={fileInputRef}
                  id="main-file-upload"
                  type="file"
                  accept="video/*,audio/*"
                  onChange={(e) => handleFileSelect(e.target.files)}
                  className="hidden"
                />

                {/* Drag overlay */}
                {isDragging && (
                  <div className="absolute inset-0 bg-purple-50/90 flex flex-col items-center justify-center z-10 rounded-xl border-2 border-dashed border-purple-400">
                    <Upload className="w-10 h-10 text-purple-600 mb-2" />
                    <p className="text-purple-700 font-medium">释放以上传文件</p>
                    <p className="text-purple-500 text-sm">支持视频和音频文件</p>
                  </div>
                )}

                {/* Validating File Status */}
                {isValidatingFile && (
                  <div className="px-4 pt-4">
                    <div className="inline-flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-lg border border-purple-200">
                      <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
                      <span className="text-sm text-purple-700">正在验证文件...</span>
                    </div>
                  </div>
                )}

                {/* Selected File Tag */}
                {selectedFile && !isValidatingFile && (
                  <div className="px-4 pt-4">
                    <div className="inline-flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-200">
                      {fileMediaInfo?.type === 'video' ? (
                        <Video className="w-4 h-4 text-green-600" />
                      ) : (
                        <Mic className="w-4 h-4 text-green-600" />
                      )}
                      <span className="text-sm text-gray-700">{formatFileName(selectedFile.name)}</span>
                      <span className="text-xs text-gray-400">
                        ({(selectedFile.size / 1024 / 1024).toFixed(1)} MB)
                      </span>
                      {fileMediaInfo && (
                        <span className="text-xs text-green-600">
                          ✓ {fileMediaInfo.type === 'video' ? '视频' : '音频'}
                          {fileMediaInfo.duration ? ` · ${Math.round(fileMediaInfo.duration)}秒` : ''}
                          {fileMediaInfo.width && fileMediaInfo.height ? ` · ${fileMediaInfo.width}×${fileMediaInfo.height}` : ''}
                        </span>
                      )}

                      <button
                        onClick={handleRemoveFile}
                        className="p-0.5 hover:bg-green-100 rounded transition ml-1"
                      >
                        <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Upload prompt when no file selected and not validating */}
                {!selectedFile && !isValidatingFile && (
                  <label 
                    htmlFor="main-file-upload"
                    className="block px-4 pt-4 pb-2 cursor-pointer"
                  >
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-purple-400 hover:bg-purple-50/50 transition">
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">点击或拖拽视频/音频文件到这里</p>
                      <p className="text-xs text-gray-400 mt-1">支持 MP4, MOV, AVI, MP3, WAV 等格式</p>
                    </div>
                  </label>
                )}

                <textarea
                  placeholder={selectedFile ? "描述你想对视频做的编辑..." : "或者描述你想制作的内容，AI 会帮你规划"}
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  className={`w-full px-4 pb-2 resize-none text-gray-700 placeholder-gray-400 focus:outline-none text-sm ${selectedFile ? 'pt-3' : 'pt-2'}`}
                  rows={2}
                />
                <div className="flex items-center justify-between px-4 pb-4">
                  <div className="flex items-center gap-1">
                    <label 
                      htmlFor="main-file-upload"
                      className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition cursor-pointer"
                      title="上传视频或音频"
                    >
                      <Upload className="w-5 h-5" />
                    </label>
                    <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
                      <Settings className="w-5 h-5" />
                    </button>
                  </div>
                  <button 
                    onClick={handleGetStarted}
                    className="px-6 py-2.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition"
                  >
                    Get started
                  </button>
                </div>
              </div>
            </div>

            {/* Popular Features */}
            <section className="mb-10">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Popular features</h2>
              <div className="grid grid-cols-5 gap-4">
                {popularFeatures.map((feature, index) => (
                  <div
                    key={index}
                    className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition cursor-pointer min-h-[140px] flex flex-col"
                  >
                    {feature.hasPreview ? (
                      // AI Video Maker Card with special preview
                      <>
                        <h3 className="font-medium text-gray-900 text-sm mb-1">{feature.title}</h3>
                        <p className="text-xs text-gray-500 mb-3 flex-1">{feature.description}</p>
                        <div className="bg-orange-50 rounded-lg p-3 border border-dashed border-orange-200">
                          <div className="text-xs text-gray-500 mb-2">Make a video about...</div>
                          <div className="space-y-1.5 mb-2">
                            <div className="h-1.5 bg-orange-200 rounded w-full" />
                            <div className="h-1.5 bg-orange-200 rounded w-3/4" />
                          </div>
                          <div className="flex items-center gap-1 text-orange-500 text-xs">
                            <Sparkles className="w-3 h-3" />
                            <span>Generating</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <feature.icon className="w-5 h-5 text-gray-500 mb-3" />
                        <h3 className="font-medium text-gray-900 text-sm mb-1">{feature.title}</h3>
                        <p className="text-xs text-gray-500">{feature.description}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Recent Media / Projects */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  {mediaList.length > 0 ? 'Uploaded Media' : 'Recent projects'}
                </h2>
                {mediaList.length > 0 && (
                  <span className="text-sm text-gray-500">{mediaList.length} files</span>
                )}
              </div>

              {isLoadingMedia ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                  <span className="ml-3 text-gray-500">Loading media...</span>
                </div>
              ) : mediaList.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                  <Video className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-2">No media uploaded yet</p>
                  <p className="text-sm text-gray-400">Upload a video or audio file to get started</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-4">
                  {mediaList.slice(0, 7).map((media) => (
                    <Link
                      key={media.id}
                      href={`/editor/${media.id}`}
                      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition group"
                    >
                      {/* Thumbnail */}
                      <div className="aspect-video bg-gray-100 flex items-center justify-center relative">
                        {media.thumbnailPath ? (
                          <img
                            src={getUploadUrl(media.thumbnailPath)}
                            alt={media.originalName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Video className="w-8 h-8 text-gray-300" />
                        )}
                        {media.duration && (
                          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 text-white text-xs rounded">
                            {Math.floor(media.duration / 60)}:{String(Math.floor(media.duration % 60)).padStart(2, '0')}
                          </span>
                        )}
                      </div>
                      {/* Info */}
                      <div className="p-3">
                        <h3 className="font-medium text-gray-900 text-sm truncate" title={media.originalName}>
                          {media.originalName}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatRelativeTime(media.createdAt)}
                          {media.width && media.height && (
                            <span className="ml-2">{media.width}x{media.height}</span>
                          )}
                        </p>
                      </div>
                    </Link>
                  ))}

                  {/* New Project Card */}
                  <button
                    onClick={handleNewProject}
                    className="bg-white rounded-xl border-2 border-dashed border-gray-200 overflow-hidden hover:border-purple-400 hover:bg-purple-50 transition group flex flex-col items-center justify-center aspect-[4/3]"
                  >
                    <Plus className="w-8 h-8 text-gray-400 group-hover:text-purple-600 transition" />
                    <span className="text-sm text-gray-500 group-hover:text-purple-600 mt-2 transition">New Project</span>
                  </button>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

// Navigation Item Component
function NavItem({ 
  icon: Icon, 
  label, 
  active, 
  onClick,
  badge,
}: { 
  icon: any; 
  label: string; 
  active?: boolean;
  onClick?: () => void;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
        active 
          ? 'bg-white/10 text-white' 
          : 'text-gray-400 hover:text-white hover:bg-white/5'
      }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1 text-left truncate">{label}</span>
      {badge && (
        <span className="w-5 h-5 rounded bg-purple-600 text-white text-xs flex items-center justify-center flex-shrink-0">
          {badge}
        </span>
      )}
    </button>
  );
}


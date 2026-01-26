'use client';

import { useState, useRef } from 'react';
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
import { mediaApi, aiApi, transcriptionApi } from '@/lib/api';

export default function HomePage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [promptText, setPromptText] = useState('');
  const [activeNav, setActiveNav] = useState('home');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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

  const handleNewProject = () => {
    router.push('/editor/new');
  };

  // 选择文件（不上传，不转录）
  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    
    // 验证文件类型
    if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) {
      alert('请上传视频或音频文件');
      return;
    }

    setSelectedFile(file);
  };

  // 移除选中的文件
  const handleRemoveFile = () => {
    setSelectedFile(null);
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
    
    if (!file.type.startsWith('video/') && !file.type.startsWith('audio/')) {
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

  // Handle AI edit request
  const handleAiEditRequest = async () => {
    if (!aiInput.trim() || isPlanning || isExecuting) return;

    const userRequest = aiInput.trim();
    setAiInput('');
    setIsPlanning(true);
    
    // Add user message
    setWorkflowMessages(prev => [
      ...prev,
      { type: 'user', content: userRequest },
      { type: 'status', content: 'Planning tasks...' },
    ]);

    try {
      // Call AI to plan tasks
      const response = await aiApi.planTasks(userRequest, {
        hasTranscript: true, // For now assume we have transcript after upload
        mediaType: translateFile?.type.startsWith('video/') ? 'video' : 'audio',
      });

      if (response.data.success && response.data.data) {
        const { tasks, summary } = response.data.data;
        
        setEditTasks(tasks);
        setWorkflowMessages(prev => [
          ...prev.filter(m => m.type !== 'status'),
          { type: 'assistant', content: summary },
        ]);

        // Add task items to messages
        tasks.forEach((task: any) => {
          setWorkflowMessages(prev => [
            ...prev,
            { type: 'task', content: task.name, taskStatus: 'pending' },
          ]);
        });

        // Auto-execute tasks
        setIsPlanning(false);
        setIsExecuting(true);

        // Execute tasks one by one
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i];
          
          // Update task status to running
          setEditTasks(prev => prev.map((t, idx) => 
            idx === i ? { ...t, status: 'running' } : t
          ));
          setWorkflowMessages(prev => prev.map((m, idx) => {
            if (m.type === 'task' && m.content === task.name) {
              return { ...m, taskStatus: 'running' };
            }
            return m;
          }));

          try {
            // For demo, we'll simulate task execution
            // In real implementation, this would call the backend
            await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
            
            // Update task status to completed
            setEditTasks(prev => prev.map((t, idx) => 
              idx === i ? { ...t, status: 'completed', result: 'Task completed successfully' } : t
            ));
            setWorkflowMessages(prev => prev.map((m) => {
              if (m.type === 'task' && m.content === task.name) {
                return { ...m, taskStatus: 'completed' };
              }
              return m;
            }));
          } catch (taskError: any) {
            setEditTasks(prev => prev.map((t, idx) => 
              idx === i ? { ...t, status: 'failed', error: taskError.message } : t
            ));
            setWorkflowMessages(prev => prev.map((m) => {
              if (m.type === 'task' && m.content === task.name) {
                return { ...m, taskStatus: 'failed' };
              }
              return m;
            }));
          }
        }

        setIsExecuting(false);
        setWorkflowMessages(prev => [
          ...prev,
          { type: 'assistant', content: 'All tasks completed! You can continue editing or give me another request.' },
        ]);

      } else {
        throw new Error(response.data.error || 'Failed to plan tasks');
      }
    } catch (error: any) {
      console.error('AI planning error:', error);
      setWorkflowMessages(prev => [
        ...prev.filter(m => m.type !== 'status'),
        { type: 'assistant', content: `Sorry, I encountered an error: ${error.message || 'Unknown error'}. Please try again.` },
      ]);
    } finally {
      setIsPlanning(false);
    }
  };

  const handleBackToHome = () => {
    setShowTranslateWorkflow(false);
    setTranslateFile(null);
    setWorkflowMessages([]);
    setIsProcessingMedia(false);
    setUploadProgress(0);
    setEditTasks([]);
    setAiInput('');
  };

  // 格式化文件名（超长时截断）
  const formatFileName = (name: string, maxLength: number = 20) => {
    if (name.length <= maxLength) return name;
    const ext = name.split('.').pop() || '';
    const baseName = name.slice(0, name.length - ext.length - 1);
    const truncatedBase = baseName.slice(0, maxLength - ext.length - 4);
    return `${truncatedBase}...${ext}`;
  };

  const quickActions = [
    { icon: Scissors, label: 'Clean up video recording', action: null },
    { icon: Users, label: 'Generate with an avatar', action: null },
    { icon: Wand2, label: 'Rough cut of podcast', action: null },
    { icon: Video, label: 'Create social clips', action: null },
    { icon: Languages, label: 'Translate & dub video', action: handleTranslateClick },
    { icon: Monitor, label: 'Turn slides into video', action: null },
    { icon: Play, label: 'Generate animated video', action: null },
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

  const recentProjects = [
    { id: '1', name: 'Product Demo Video', updatedAt: '2 hours ago' },
    { id: '2', name: 'Team Meeting Recording', updatedAt: 'Yesterday' },
    { id: '3', name: 'Tutorial Series Ep.1', updatedAt: '3 days ago' },
  ];

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
              <button className="w-full max-w-xl flex items-center justify-between px-6 py-4 bg-gray-100 rounded-xl mb-8 hover:bg-gray-200 transition">
                <div className="flex items-center gap-3">
                  <Languages className="w-5 h-5 text-gray-600" />
                  <span className="text-gray-700 font-medium">Translate & dub video</span>
                </div>
                <span className="text-gray-400">›</span>
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
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{msg.content}</p>
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
                  </div>
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

              {/* Quick Action Buttons - Row 1 */}
              <div className="flex flex-wrap justify-center gap-2 mb-3">
                {quickActions.slice(0, 4).map((action, index) => (
                  <button
                    key={index}
                    onClick={action.action || undefined}
                    className="flex items-center gap-2 px-4 py-2 bg-white rounded-full text-sm text-gray-700 hover:shadow-md transition border border-gray-200 hover:border-gray-300"
                  >
                    <action.icon className="w-4 h-4 text-purple-600" />
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
              
              {/* Quick Action Buttons - Row 2 */}
              <div className="flex flex-wrap justify-center gap-2 mb-8">
                {quickActions.slice(4).map((action, index) => (
                  <button
                    key={index}
                    onClick={action.action || undefined}
                    className="flex items-center gap-2 px-4 py-2 bg-white rounded-full text-sm text-gray-700 hover:shadow-md transition border border-gray-200 hover:border-gray-300"
                  >
                    <action.icon className="w-4 h-4 text-purple-600" />
                    <span>{action.label}</span>
                  </button>
                ))}
                <button className="text-sm text-purple-600 hover:underline px-3">
                  Browse more templates...
                </button>
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
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
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

                {/* Selected File Tag */}
                {selectedFile && (
                  <div className="px-4 pt-4">
                    <div className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg border border-gray-200">
                      <Video className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-gray-700">{formatFileName(selectedFile.name)}</span>
                      <span className="text-xs text-gray-400">
                        ({(selectedFile.size / 1024 / 1024).toFixed(1)} MB)
                      </span>
                      
                      <button 
                        onClick={handleRemoveFile}
                        className="p-0.5 hover:bg-gray-200 rounded transition ml-1"
                      >
                        <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
                      </button>
                    </div>
                  </div>
                )}

                <textarea
                  placeholder="Upload a file or describe what you want to make, and I'll help you plan it."
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  className={`w-full px-4 pb-2 resize-none text-gray-700 placeholder-gray-400 focus:outline-none text-sm ${selectedFile ? 'pt-3' : 'pt-4'}`}
                  rows={2}
                />
                <div className="flex items-center justify-between px-4 pb-4">
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={handleUploadClick}
                      className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition"
                      title="上传视频或音频"
                    >
                      <Upload className="w-5 h-5" />
                    </button>
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

            {/* Recent Projects */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Recent projects</h2>
                <button className="text-sm text-purple-600 hover:underline">View all</button>
              </div>
              <div className="grid grid-cols-4 gap-4">
                {recentProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/editor/${project.id}`}
                    className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition group"
                  >
                    {/* Thumbnail */}
                    <div className="aspect-video bg-gray-100 flex items-center justify-center">
                      <Video className="w-8 h-8 text-gray-300" />
                    </div>
                    {/* Info */}
                    <div className="p-3">
                      <h3 className="font-medium text-gray-900 text-sm truncate">{project.name}</h3>
                      <p className="text-xs text-gray-500 mt-1">{project.updatedAt}</p>
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


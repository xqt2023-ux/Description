'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { DescriptEditor } from '@/components/editor/DescriptEditorNew';
import { Suspense, useEffect, useState } from 'react';

function EditorContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const mediaId = searchParams.get('mediaId') || undefined;
  const mediaUrl = searchParams.get('mediaUrl') || undefined;
  const transcriptionId = searchParams.get('transcriptionId') || undefined;
  const hasFile = searchParams.get('hasFile') === 'true';
  
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isWaitingForFile, setIsWaitingForFile] = useState(hasFile);
  
  // 从首页获取待处理的文件
  useEffect(() => {
    if (hasFile && typeof window !== 'undefined') {
      const file = (window as any).__pendingFile;
      if (file) {
        setPendingFile(file);
        // 清除全局变量
        delete (window as any).__pendingFile;
        sessionStorage.removeItem('pendingFile');
        // 找到文件后才结束等待状态
        setIsWaitingForFile(false);
      } else {
        // 没有文件，延迟一点再结束等待状态（给用户看到加载状态的机会）
        const timer = setTimeout(() => {
          setIsWaitingForFile(false);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [hasFile]);

  return (
    <DescriptEditor 
      projectId={projectId} 
      initialMediaId={mediaId} 
      initialMediaUrl={mediaUrl}
      initialTranscriptionId={transcriptionId}
      pendingFile={pendingFile}
      isWaitingForFile={isWaitingForFile}
    />
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-[#1a1a1a] flex items-center justify-center text-white">Loading...</div>}>
      <EditorContent />
    </Suspense>
  );
}

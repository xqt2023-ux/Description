'use client';

import { useState, useEffect, useRef } from 'react';
import { underlordApi } from '@/lib/api';
import { useEditorStore } from '@/stores/editorStore';
import {
  Sparkles,
  Send,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Loader2,
  Check,
  X,
  Zap,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type StepStatus = 'pending' | 'running' | 'done' | 'failed';

interface OperationStep {
  name: string;
  status: StepStatus;
  durationMs?: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'streaming' | 'done' | 'error';
  steps?: OperationStep[];
  operationId?: string;
  detailsOpen?: boolean;
}

type SSEEvent =
  | { type: 'text'; delta: string }
  | { type: 'plan'; steps: string[] }
  | { type: 'step_start'; name: string }
  | { type: 'step_done'; name: string; durationMs: number }
  | { type: 'done'; operationId: string }
  | { type: 'error'; message: string };

// ── Component ─────────────────────────────────────────────────────────────────

export function InteractiveWorkflowSidebar() {
  const { mediaFiles, duration } = useEditorStore();
  const mediaId = mediaFiles[0]?.id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Listen for auto-edit trigger from DescriptEditorNew ─────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { request, failed } = (e as CustomEvent).detail;
      if (failed) {
        const errMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Transcription failed. Auto-edit cancelled.',
          status: 'error',
        };
        setMessages(prev => [...prev, errMsg]);
        return;
      }
      if (request && mediaId) {
        sendMessage(request);
      }
    };
    window.addEventListener('auto-edit-request', handler);
    return () => window.removeEventListener('auto-edit-request', handler);
  }, [mediaId]); // re-bind when mediaId becomes available

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async (text?: string) => {
    const msgText = (text || input).trim();
    if (!msgText || !mediaId || isStreaming) return;

    setInput('');

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: msgText,
      status: 'done',
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      steps: [],
      detailsOpen: false,
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    try {
      const response = await underlordApi.chat({
        message: msgText,
        mediaId,
        mediaInfo: { duration: duration || 0, hasAudio: true },
        conversationHistory: messages.map(m => ({ role: m.role, content: m.content })),
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event: SSEEvent = JSON.parse(line.slice(6));
            applySSEEvent(assistantId, event);
          } catch {
            // malformed JSON — skip
          }
        }
      }
    } catch (err: any) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, status: 'error', content: m.content || (err.message || 'Connection failed') }
            : m
        )
      );
    } finally {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId && m.status === 'streaming' ? { ...m, status: 'done' } : m
        )
      );
      setIsStreaming(false);
    }
  };

  // ── Apply SSE event to the in-progress assistant message ─────────────────
  const applySSEEvent = (msgId: string, event: SSEEvent) => {
    setMessages(prev =>
      prev.map(m => {
        if (m.id !== msgId) return m;
        switch (event.type) {
          case 'text':
            return { ...m, content: m.content + event.delta };
          case 'plan':
            return {
              ...m,
              steps: event.steps.map(name => ({ name, status: 'pending' as StepStatus })),
            };
          case 'step_start':
            return {
              ...m,
              steps: m.steps?.map(s => s.name === event.name ? { ...s, status: 'running' as StepStatus } : s),
            };
          case 'step_done':
            return {
              ...m,
              steps: m.steps?.map(s =>
                s.name === event.name ? { ...s, status: 'done' as StepStatus, durationMs: event.durationMs } : s
              ),
            };
          case 'done':
            return { ...m, status: 'done', operationId: event.operationId || undefined };
          case 'error':
            return { ...m, status: 'error', content: m.content + (m.content ? '\n' : '') + event.message };
          default:
            return m;
        }
      })
    );
  };

  // ── Toggle Details section ────────────────────────────────────────────────
  const toggleDetails = (msgId: string) => {
    setMessages(prev =>
      prev.map(m => m.id === msgId ? { ...m, detailsOpen: !m.detailsOpen } : m)
    );
  };

  // ── Revert ────────────────────────────────────────────────────────────────
  const handleRevert = async (operationId: string, msgId: string) => {
    try {
      await underlordApi.revert(operationId);
      setMessages(prev =>
        prev.map(m => m.id === msgId ? { ...m, operationId: undefined } : m)
      );
    } catch {
      // silent
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#161616]">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2a2a2a] flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white leading-none">Underlord</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">AI Video Editor</p>
        </div>
      </div>

      {/* ── Message list ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-purple-400" />
            </div>
            <p className="text-xs text-gray-500 max-w-[180px]">
              Ask Underlord to edit your video — remove fillers, trim silence, enhance audio, and more.
            </p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'user' ? (
              // User bubble
              <div className="max-w-[85%] px-3 py-2 bg-[#7c3aed] rounded-2xl rounded-tr-sm">
                <p className="text-xs text-white leading-relaxed">{msg.content}</p>
              </div>
            ) : (
              // Assistant message
              <div className="max-w-[95%] space-y-2">
                {/* Text content */}
                <div className="text-xs text-gray-200 leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                  {msg.status === 'streaming' && !msg.content && (
                    <span className="inline-flex gap-0.5 items-center">
                      <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  )}
                  {msg.status === 'streaming' && msg.content && (
                    <span className="inline-block w-0.5 h-3.5 bg-purple-400 animate-pulse ml-0.5 align-middle" />
                  )}
                </div>

                {/* Details collapsible */}
                {msg.steps && msg.steps.length > 0 && (
                  <div className="border border-[#2a2a2a] rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleDetails(msg.id)}
                      className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-gray-500 hover:text-gray-300 hover:bg-[#1c1c1c] transition"
                    >
                      {msg.detailsOpen
                        ? <ChevronDown className="w-3 h-3" />
                        : <ChevronRight className="w-3 h-3" />}
                      Details
                    </button>
                    {msg.detailsOpen && (
                      <div className="border-t border-[#2a2a2a] divide-y divide-[#222]">
                        {msg.steps.map((step, i) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                            <StepIcon status={step.status} />
                            <span className="flex-1 text-[11px] text-gray-400">{step.name}</span>
                            {step.durationMs !== undefined && (
                              <span className="text-[10px] text-gray-600">
                                {step.durationMs < 1000
                                  ? `${step.durationMs}ms`
                                  : `${(step.durationMs / 1000).toFixed(1)}s`}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Revert button */}
                {msg.status === 'done' && msg.operationId && (
                  <button
                    onClick={() => handleRevert(msg.operationId!, msg.id)}
                    className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-purple-400 transition"
                    aria-label="Revert"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Revert
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Input bar ── */}
      <div className="border-t border-[#2a2a2a] p-3 flex-shrink-0">
        {!mediaId && (
          <p className="text-[11px] text-yellow-500/70 mb-2 px-1">Upload a video first to start editing.</p>
        )}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !isStreaming && sendMessage()}
            placeholder="Ask Underlord"
            disabled={isStreaming || !mediaId}
            className="flex-1 bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#7c3aed]/50 disabled:opacity-40"
          />
          <button
            onClick={() => sendMessage()}
            disabled={isStreaming || !input.trim() || !mediaId}
            aria-label="Send"
            className="px-2.5 py-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center"
          >
            {isStreaming
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="text-[10px] text-gray-700 mt-1.5 px-1">Underlord can make mistakes.</p>
      </div>
    </div>
  );
}

// ── Step status icon ───────────────────────────────────────────────────────────

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'running') {
    return <Loader2 className="w-3 h-3 text-purple-400 animate-spin flex-shrink-0" />;
  }
  if (status === 'done') {
    return (
      <div className="w-3 h-3 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
        <Check className="w-2 h-2 text-green-400" />
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="w-3 h-3 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
        <X className="w-2 h-2 text-red-400" />
      </div>
    );
  }
  return <div className="w-3 h-3 rounded-full bg-[#2a2a2a] border border-[#444] flex-shrink-0" />;
}

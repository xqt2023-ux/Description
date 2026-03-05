'use client';

import { useState, useEffect } from 'react';
import { workflowApi } from '@/lib/api';
import { useEditorStore } from '@/stores/editorStore';
import {
  Sparkles,
  Play,
  Check,
  X,
  RotateCcw,
  ChevronRight,
  Loader2,
  SkipForward,
} from 'lucide-react';

type Phase = 'idle' | 'planning' | 'executing' | 'done';
type StepStatus = 'pending' | 'executing' | 'done' | 'failed' | 'skipped';

interface UIStep {
  id: string;
  type: string;
  description: string;
  checked: boolean;
  status: StepStatus;
  resultSummary?: string;
}

const QUICK_ACTIONS = [
  'Remove filler words and hesitations',
  'Remove silences longer than 1 second',
  'Trim the ending silence',
  'Remove background noise and enhance audio',
  'Generate captions',
];

export function InteractiveWorkflowSidebar() {
  const { mediaFiles, duration } = useEditorStore();

  const [phase, setPhase] = useState<Phase>('idle');
  const [prompt, setPrompt] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [steps, setSteps] = useState<UIStep[]>([]);
  const [executingStepId, setExecutingStepId] = useState<string | null>(null);
  const [lastDoneIndex, setLastDoneIndex] = useState<number>(-1);

  const mediaId = mediaFiles[0]?.id;
  const mediaInfo = { duration: duration || 0, hasAudio: true };

  // ── Execute steps (extracted so createWorkflow can call directly) ─
  const runSteps = async (wfId: string, stepsToRun: UIStep[]) => {
    setPhase('executing');
    setLastDoneIndex(-1);
    setSteps(prev => prev.map(s => (!s.checked ? { ...s, status: 'skipped' } : s)));

    for (let i = 0; i < stepsToRun.length; i++) {
      if (!stepsToRun[i].checked) continue;

      const stepId = stepsToRun[i].id;
      setExecutingStepId(stepId);
      setSteps(prev => prev.map((s, idx) => (idx === i ? { ...s, status: 'executing' } : s)));

      try {
        const execRes = await workflowApi.executeStep(wfId, stepId);
        await workflowApi.confirmStep(wfId, stepId, true);

        const payload = execRes.data?.data;
        const summary =
          payload?.result?.content ||
          payload?.preview?.content ||
          payload?.description ||
          'Completed';

        setSteps(prev =>
          prev.map((s, idx) => (idx === i ? { ...s, status: 'done', resultSummary: String(summary) } : s))
        );
        setLastDoneIndex(i);
      } catch (err: any) {
        const msg = err.response?.data?.error || 'Step failed';
        setSteps(prev =>
          prev.map((s, idx) => (idx === i ? { ...s, status: 'failed', resultSummary: msg } : s))
        );
      }
    }

    setExecutingStepId(null);
    setPhase('done');
  };

  // ── Create workflow ─────────────────────────────────────────────
  const createWorkflow = async (text?: string, autoExecute = false) => {
    const request = (text || prompt).trim();
    if (!request || !mediaId) return;

    setPrompt('');
    setError(null);
    setIsCreating(true);

    try {
      const res = await workflowApi.create(request, mediaId, mediaInfo);
      const { workflowId: wfId, steps: rawSteps } = res.data.data;

      const newSteps: UIStep[] = rawSteps.map((s: any) => ({
        id: s.id,
        type: s.type,
        description: s.description,
        checked: true,
        status: 'pending' as StepStatus,
      }));

      setWorkflowId(wfId);
      setSteps(newSteps);

      if (autoExecute) {
        // Execute directly with local variables, bypassing stale React state
        await runSteps(wfId, newSteps);
      } else {
        setPhase('planning');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate edit plan. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  // ── Listen for auto-edit trigger from DescriptEditorNew ─────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { request, failed } = (e as CustomEvent).detail;
      if (failed) {
        setError('Transcription failed. Auto-edit cancelled.');
        return;
      }
      if (request && mediaId) {
        createWorkflow(request, true);
      }
    };
    window.addEventListener('auto-edit-request', handler);
    return () => window.removeEventListener('auto-edit-request', handler);
  }, [mediaId]); // re-bind when mediaId becomes available

  // ── Step checkbox toggle ─────────────────────────────────────────
  const toggleStep = (id: string) =>
    setSteps(prev => prev.map(s => (s.id === id ? { ...s, checked: !s.checked } : s)));

  const toggleAll = () => {
    const allChecked = steps.every(s => s.checked);
    setSteps(prev => prev.map(s => ({ ...s, checked: !allChecked })));
  };

  // ── Batch execute (manual) ───────────────────────────────────────
  const executeAll = async () => {
    if (!workflowId) return;
    await runSteps(workflowId, steps);
  };

  // ── Undo last completed step ─────────────────────────────────────
  const undoLast = async () => {
    if (!workflowId || lastDoneIndex < 0) return;
    try {
      await workflowApi.undo(workflowId);
      const idx = lastDoneIndex;
      setSteps(prev =>
        prev.map((s, i) => (i === idx ? { ...s, status: 'pending', resultSummary: undefined } : s))
      );
      // Find the new last done index
      setSteps(prev => {
        const newLast = prev.reduce(
          (acc, s, i) => (i < idx && s.status === 'done' ? i : acc),
          -1
        );
        setLastDoneIndex(newLast);
        return prev;
      });
    } catch {
      // silent — undo may not be supported for this step
    }
  };

  // ── Cancel mid-execution ─────────────────────────────────────────
  const cancelWorkflow = async () => {
    if (!workflowId) return;
    try { await workflowApi.cancel(workflowId); } catch {}
    reset();
  };

  // ── Reset to idle ────────────────────────────────────────────────
  const reset = () => {
    setPhase('idle');
    setWorkflowId(null);
    setSteps([]);
    setError(null);
    setPrompt('');
    setExecutingStepId(null);
    setLastDoneIndex(-1);
  };

  const checkedCount = steps.filter(s => s.checked).length;
  const allChecked = steps.length > 0 && steps.every(s => s.checked);

  return (
    <div className="flex flex-col h-full bg-[#161616]">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white leading-none">Underlord</h3>
            <p className="text-[10px] text-gray-500 mt-0.5">AI Video Editor</p>
          </div>
        </div>
        {(phase === 'planning' || phase === 'executing') && (
          <button
            onClick={phase === 'executing' ? cancelWorkflow : reset}
            className="text-xs text-gray-500 hover:text-gray-300 transition"
          >
            {phase === 'executing' ? 'Cancel' : 'New edit'}
          </button>
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto">

        {/* === IDLE === */}
        {phase === 'idle' && (
          <div className="p-3 space-y-2">
            {!mediaId && (
              <div className="px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <p className="text-xs text-yellow-400">Upload a video first to start editing.</p>
              </div>
            )}
            <p className="text-xs text-gray-600 px-1 pb-1">Quick actions</p>
            {QUICK_ACTIONS.map((action, i) => (
              <button
                key={i}
                onClick={() => createWorkflow(action)}
                disabled={isCreating || !mediaId}
                className="w-full text-left px-3 py-2.5 bg-[#1c1c1c] hover:bg-[#252525] border border-[#2a2a2a] hover:border-[#7c3aed]/40 rounded-lg text-xs text-gray-300 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {action}
              </button>
            ))}
            {error && <p className="text-xs text-red-400 px-1 pt-1">{error}</p>}
          </div>
        )}

        {/* === PLANNING === */}
        {phase === 'planning' && (
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between px-1 pb-1">
              <p className="text-xs text-gray-500">Edit plan — {steps.length} steps</p>
              <button
                onClick={toggleAll}
                className="text-xs text-[#7c3aed] hover:text-purple-300 transition"
              >
                {allChecked ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            {steps.map(step => (
              <button
                key={step.id}
                onClick={() => toggleStep(step.id)}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-[#2a2a2a] hover:border-[#7c3aed]/40 bg-[#1c1c1c] hover:bg-[#252525] transition text-left"
              >
                <div
                  className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition ${
                    step.checked
                      ? 'bg-[#7c3aed] border-[#7c3aed]'
                      : 'border-gray-600 bg-transparent'
                  }`}
                >
                  {step.checked && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-200 leading-snug">{step.description}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5 capitalize">
                    {step.type.replace(/_/g, ' ')}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* === EXECUTING / DONE === */}
        {(phase === 'executing' || phase === 'done') && (
          <div className="p-3 space-y-2">
            <p className="text-xs text-gray-500 px-1 pb-1">
              {phase === 'executing' ? 'Running edits...' : 'Results'}
            </p>
            {steps.map((step, i) => (
              <div
                key={step.id}
                className="px-3 py-2.5 rounded-lg border border-[#2a2a2a] bg-[#1c1c1c]"
              >
                <div className="flex items-center gap-2">
                  {/* Status icon */}
                  <StatusIcon status={step.status} />
                  <p className="flex-1 text-xs text-gray-300 leading-snug">{step.description}</p>
                  {/* Undo — only on the last done step, after execution */}
                  {phase === 'done' && step.status === 'done' && i === lastDoneIndex && (
                    <button
                      onClick={undoLast}
                      className="flex-shrink-0 flex items-center gap-1 text-[10px] text-gray-600 hover:text-purple-400 transition"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Undo
                    </button>
                  )}
                </div>
                {step.resultSummary && (
                  <p
                    className={`mt-1 text-[10px] pl-5 ${
                      step.status === 'failed'
                        ? 'text-red-400'
                        : step.status === 'skipped'
                        ? 'text-gray-600'
                        : 'text-gray-500'
                    }`}
                  >
                    {step.resultSummary}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Footer / action bar ── */}
      <div className="border-t border-[#2a2a2a] p-3 flex-shrink-0">
        {phase === 'idle' && (
          <div className="flex gap-2">
            <input
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !isCreating && createWorkflow()}
              placeholder="Describe your edit..."
              disabled={isCreating || !mediaId}
              className="flex-1 bg-[#1c1c1c] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#7c3aed]/50 disabled:opacity-40"
            />
            <button
              onClick={() => createWorkflow()}
              disabled={isCreating || !prompt.trim() || !mediaId}
              className="px-3 py-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white rounded-lg text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center"
            >
              {isCreating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}

        {phase === 'planning' && (
          <button
            onClick={executeAll}
            disabled={checkedCount === 0}
            className="w-full py-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white rounded-lg text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Play className="w-3 h-3" />
            Execute {checkedCount} step{checkedCount !== 1 ? 's' : ''}
          </button>
        )}

        {phase === 'executing' && (
          <button
            onClick={cancelWorkflow}
            className="w-full py-2 bg-[#252525] hover:bg-red-900/30 text-gray-400 hover:text-red-400 rounded-lg text-xs font-medium transition border border-[#333]"
          >
            Cancel
          </button>
        )}

        {phase === 'done' && (
          <button
            onClick={reset}
            className="w-full py-2 bg-[#252525] hover:bg-[#2a2a2a] text-gray-300 rounded-lg text-xs font-medium transition border border-[#333]"
          >
            New edit
          </button>
        )}
      </div>
    </div>
  );
}

// ── Status icon helper ────────────────────────────────────────────────────────
function StatusIcon({ status }: { status: StepStatus }) {
  if (status === 'executing') {
    return <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin flex-shrink-0" />;
  }
  if (status === 'done') {
    return (
      <div className="w-3.5 h-3.5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
        <Check className="w-2 h-2 text-green-400" />
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="w-3.5 h-3.5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
        <X className="w-2 h-2 text-red-400" />
      </div>
    );
  }
  if (status === 'skipped') {
    return <SkipForward className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />;
  }
  // pending
  return <div className="w-3.5 h-3.5 rounded-full bg-[#2a2a2a] border border-[#444] flex-shrink-0" />;
}

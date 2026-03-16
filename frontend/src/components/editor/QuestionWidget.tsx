'use client';

import { useState, useRef } from 'react';
import { Upload } from 'lucide-react';

// ── Shared type (mirrors backend QuestionDef) ──────────────────────────────

export interface QuestionDef {
  kind: 'number' | 'choice' | 'position' | 'file';
  key: string;
  label: string;
  // number
  default?: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  // choice
  options?: Array<{ label: string; value: string }>;
  // file
  accept?: string;
}

// ── Root widget — picks the right sub-component ────────────────────────────

interface QuestionWidgetProps {
  question: QuestionDef;
  answered?: string;           // undefined = unanswered; string = collapsed read-only summary
  onAnswer: (value: string) => void;
}

export function QuestionWidget({ question, answered, onAnswer }: QuestionWidgetProps) {
  // Already answered — show compact read-only row
  if (answered !== undefined) {
    return (
      <div className="flex items-center gap-2 py-1 text-xs">
        <span className="text-gray-600 truncate">{question.label}</span>
        <span className="text-purple-400 font-medium flex-shrink-0">{answered}</span>
      </div>
    );
  }

  return (
    <div className="mt-2 p-3 bg-[#1e1e1e] border border-[#2e2e2e] rounded-xl space-y-2">
      <p className="text-xs text-gray-300 font-medium">{question.label}</p>
      {question.kind === 'number'   && <NumberWidget   q={question} onAnswer={onAnswer} />}
      {question.kind === 'choice'   && <ChoiceWidget   q={question} onAnswer={onAnswer} />}
      {question.kind === 'position' && <PositionWidget              onAnswer={onAnswer} />}
      {question.kind === 'file'     && <FileWidget     q={question} onAnswer={onAnswer} />}
    </div>
  );
}

// ── NumberWidget — slider + numeric input ──────────────────────────────────

function NumberWidget({ q, onAnswer }: { q: QuestionDef; onAnswer: (v: string) => void }) {
  const min = q.min ?? 0;
  const max = q.max ?? 10;
  const step = q.step ?? 0.5;
  const [value, setValue] = useState<number>(q.default ?? min);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => setValue(Number(e.target.value))}
          className="flex-1 accent-[#7c3aed]"
        />
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={e => setValue(Math.min(max, Math.max(min, Number(e.target.value))))}
            className="w-14 bg-[#151515] border border-[#333] rounded px-2 py-1 text-xs text-gray-200 text-right outline-none focus:border-[#7c3aed]/60"
          />
          {q.unit && <span className="text-xs text-gray-500">{q.unit}</span>}
        </div>
      </div>
      <button
        onClick={() => onAnswer(`${value}${q.unit ? q.unit : ''}`)}
        className="w-full py-1.5 bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-xs rounded-lg transition font-medium"
      >
        确认
      </button>
    </div>
  );
}

// ── ChoiceWidget — button group, click = immediate submit ──────────────────

function ChoiceWidget({ q, onAnswer }: { q: QuestionDef; onAnswer: (v: string) => void }) {
  const options = q.options ?? [];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onAnswer(opt.label)}
          className="px-3 py-1.5 text-xs border border-[#333] rounded-lg text-gray-300 hover:border-[#7c3aed] hover:text-white hover:bg-[#7c3aed]/10 transition"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── PositionWidget — 3×3 grid, click = immediate submit ───────────────────

const POSITIONS = [
  { value: 'top-left',     label: '↖', title: '左上' },
  { value: 'top',          label: '↑', title: '上方' },
  { value: 'top-right',    label: '↗', title: '右上' },
  { value: 'left',         label: '←', title: '左侧' },
  { value: 'center',       label: '·', title: '中间' },
  { value: 'right',        label: '→', title: '右侧' },
  { value: 'bottom-left',  label: '↙', title: '左下' },
  { value: 'bottom',       label: '↓', title: '下方' },
  { value: 'bottom-right', label: '↘', title: '右下' },
];

function PositionWidget({ onAnswer }: { onAnswer: (v: string) => void }) {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="grid grid-cols-3 gap-1">
        {POSITIONS.map(pos => (
          <button
            key={pos.value}
            title={pos.title}
            onClick={() => onAnswer(pos.title)}
            onMouseEnter={() => setHovered(pos.value)}
            onMouseLeave={() => setHovered(null)}
            className={`w-9 h-9 flex items-center justify-center text-base rounded-md border transition ${
              hovered === pos.value
                ? 'border-[#7c3aed] bg-[#7c3aed]/20 text-white'
                : 'border-[#333] text-gray-500 hover:border-[#7c3aed]/50'
            }`}
          >
            {pos.label}
          </button>
        ))}
      </div>
      {hovered && (
        <p className="text-[10px] text-gray-500">{POSITIONS.find(p => p.value === hovered)?.title}</p>
      )}
    </div>
  );
}

// ── FileWidget — drag & drop upload zone ──────────────────────────────────

function FileWidget({ q, onAnswer }: { q: QuestionDef; onAnswer: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);

  const handleFile = (file: File) => {
    setFilename(file.name);
    // Store the file globally so the tool executor can access it
    (window as any).__pendingUploadFile = file;
    onAnswer(file.name);
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={q.accept}
        className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        className={`flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed rounded-xl cursor-pointer transition ${
          dragging
            ? 'border-[#7c3aed] bg-[#7c3aed]/10'
            : 'border-[#333] hover:border-[#7c3aed]/50 hover:bg-[#7c3aed]/5'
        }`}
      >
        <Upload className="w-5 h-5 text-gray-500" />
        {filename ? (
          <p className="text-xs text-purple-400 font-medium truncate max-w-[160px]">{filename}</p>
        ) : (
          <>
            <p className="text-xs text-gray-400">拖拽或点击上传</p>
            {q.accept && (
              <p className="text-[10px] text-gray-600">{q.accept.replace('image/*', 'PNG / SVG / JPG')}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

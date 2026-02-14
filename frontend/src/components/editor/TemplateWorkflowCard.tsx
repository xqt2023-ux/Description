import React from 'react';
import { ChevronDown } from 'lucide-react';

interface TemplateWorkflowCardProps {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  setup: string;
  workflow: string[];
  completion: string;
  isExpanded: boolean;
  onToggle: () => void;
}

export default function TemplateWorkflowCard({
  id,
  icon: Icon,
  label,
  setup,
  workflow,
  completion,
  isExpanded,
  onToggle,
}: TemplateWorkflowCardProps) {
  return (
    <div className="w-full max-w-4xl mx-auto">
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-6 py-4 rounded-xl transition ${
          isExpanded
            ? 'bg-purple-100 border-2 border-purple-300 shadow-md'
            : 'bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm'
        }`}
      >
        <div className="flex items-center gap-3">
          <Icon className={`w-5 h-5 ${isExpanded ? 'text-purple-600' : 'text-gray-600'}`} />
          <span className={`font-medium ${isExpanded ? 'text-purple-900' : 'text-gray-700'}`}>
            {label}
          </span>
        </div>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {isExpanded && (
        <div className="mt-4 p-6 bg-purple-50 rounded-xl border border-purple-200">
          <div className="mb-6">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3">SET-UP</h3>
            <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{setup}</p>
          </div>
          <div className="mb-6">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3">WORKFLOW</h3>
            <ul className="space-y-2">
              {workflow.map((step, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-200 text-purple-700 text-xs font-medium flex items-center justify-center mt-0.5">{index + 1}</span>
                  <span className="text-sm text-gray-700 flex-1">{step}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="pt-4 border-t border-purple-200">
            <p className="text-sm text-gray-600 italic">{completion}</p>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { 
  X, 
  Save, 
  Loader2, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import { cn } from '../lib/utils';

interface SaveToWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  bundleId: string;
  defaultName: string;
}

export function SaveToWorkspaceModal({ 
  isOpen, 
  onClose, 
  bundleId, 
  defaultName 
}: SaveToWorkspaceModalProps) {
  const [filename, setFilename] = useState(() => {
    return defaultName ? `edited-${defaultName}` : 'edited-bundle.aab';
  });
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' | null }>({ message: '', type: null });

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filename.trim()) {
      setStatus({ message: 'Filename is required', type: 'error' });
      return;
    }

    setIsLoading(true);
    setStatus({ message: '', type: null });

    try {
      const res = await fetch('/api/save-to-workspace', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bundleId,
          filename: filename.trim()
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save to workspace.');
      }

      setStatus({ message: data.message, type: 'success' });
      
      // Auto-close after successful save
      setTimeout(() => {
        onClose();
        setStatus({ message: '', type: null });
      }, 2000);
    } catch (err: any) {
      setStatus({ message: err.message, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-zinc-950 border border-white/10 rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden relative p-8">
        <div className="absolute -top-24 -left-24 w-64 h-64 bg-brand/5 rounded-full blur-3xl opacity-50 pointer-events-none" />
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand/10 border border-brand/20 rounded-xl flex items-center justify-center">
              <Save className="w-5 h-5 text-brand" />
            </div>
            <div>
              <h3 className="font-black text-lg text-white uppercase tracking-tight">Save to Workspace</h3>
              <p className="text-[9px] text-zinc-500 uppercase tracking-wider font-bold">Write back to project files</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-white/5 rounded-lg transition-colors border border-transparent hover:border-white/5"
          >
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="space-y-6 relative z-10">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block">
              Workspace Filename
            </label>
            <input 
              type="text" 
              placeholder="edited-bundle.aab"
              className="w-full bg-zinc-900/60 border border-white/5 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-brand/50 transition-all font-mono"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              disabled={isLoading}
            />
            <p className="text-[9px] text-zinc-500 leading-relaxed uppercase tracking-wide">
              The file will be written to the project root directory. You can access it directly via the AI Studio file list or terminal.
            </p>
          </div>

          {/* Status Display */}
          {status.type && (
            <div
              className={cn(
                "p-4 rounded-xl text-xs font-bold flex items-start gap-3",
                status.type === 'success'
                  ? "bg-emerald-500/5 text-emerald-400 border border-emerald-500/10"
                  : "bg-rose-500/5 text-rose-400 border border-rose-500/10"
              )}
            >
              {status.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 animate-pulse" />
              ) : (
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
              )}
              <div>
                <p className="uppercase tracking-wider text-[10px] font-black mb-1">
                  {status.type === 'success' ? 'Workspace Save Successful' : 'Save Error'}
                </p>
                <p className="opacity-90 leading-relaxed font-mono text-[10px]">{status.message}</p>
              </div>
            </div>
          )}

          {/* Action Button */}
          <button
            type="submit"
            disabled={isLoading}
            className={cn(
              "w-full py-4 rounded-xl font-black uppercase text-xs tracking-widest text-white transition-all active:scale-95 flex items-center justify-center gap-2 shadow-xl",
              isLoading
                ? "bg-zinc-800 text-zinc-600 border border-white/5 cursor-not-allowed"
                : "bg-brand hover:brightness-110 shadow-brand/20"
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                Writing File...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 text-white" />
                Commit to Workspace
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

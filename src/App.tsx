import React, { useState, useRef } from 'react';
import { 
  Upload, 
  File, 
  Search, 
  Download, 
  RefreshCw, 
  FileCode, 
  Image as ImageIcon, 
  CheckCircle2, 
  AlertCircle,
  AlertTriangle,
  Archive,
  Menu,
  ChevronRight,
  FolderOpen,
  Plus,
  X,
  Settings,
  ShieldCheck,
  Building2,
  Sparkles,
  Save,
  Wrench,
  Loader2,
  Zap
} from 'lucide-react';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { ApkSigner } from './components/ApkSigner';
import { SaveToWorkspaceModal } from './components/SaveToWorkspaceModal';

// --- Types ---
interface BundleFile {
  name: string;
  size: number;
  isDirectory: boolean;
}

interface Bundle {
  bundleId: string;
  name: string;
  files: BundleFile[];
}

interface Metadata {
  token: string;
  duns: string;
  companyName: string;
}

interface FixHistoryItem {
  timestamp: string;
  explanation: string;
  changes: string[];
}

interface BundleVersion {
  index: number;
  label: string;
  timestamp: number;
}

interface AuditReport {
  sdk: { target: string, min: string, status: 'Success' | 'Warning' | 'Critical' };
  appInfo: { package: string, versionCode: string, versionName: string, label: string, framework: string };
  manifestIssues: { type: string, severity: 'Warning' | 'Critical', message: string, suggestion: string }[];
  localization: { count: number, status: string };
  integrityToken: { status: 'Valid' | 'Warning' | 'Invalid' | 'Missing', message: string };
  score: number;
}

// --- Components ---

function FileUploader({ onUpload, isLoading }: { onUpload: (file: File) => void, isLoading: boolean }) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith('.aab') || file.name.endsWith('.zip'))) {
      onUpload(file);
    }
  };

  return (
    <div
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={cn(
        "relative group cursor-pointer glass p-12 transition-all duration-500 ease-out",
        "flex flex-col items-center justify-center gap-6 text-center overflow-hidden grid-bg",
        isDragging 
          ? "ring-4 ring-brand/30 border-brand/50 scale-[1.02]" 
          : "hover:scale-[1.01] hover:border-brand/20"
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-brand/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      {isLoading && <div className="scanline" />}
      
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept=".aab,.zip"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
        }}
      />
      
      <div className={cn(
        "relative z-10 w-24 h-24 rounded-3xl flex items-center justify-center transition-all duration-700",
        isDragging ? "bg-brand text-white rotate-12 shadow-brand/40 shadow-2xl" : "bg-white/5 text-zinc-400 group-hover:bg-brand/10 group-hover:text-brand"
      )}>
        {isLoading ? (
          <RefreshCw className="w-10 h-10 animate-spin" />
        ) : (
          <Archive className="w-10 h-10" />
        )}
      </div>

      <div className="space-y-3 relative z-10">
        <h3 className="text-2xl font-black text-white tracking-tight">
          {isLoading ? 'SYNCING BUNDLE...' : 'ANALYZE MAGNITUDE'}
        </h3>
        <p className="text-zinc-500 max-w-xs mx-auto text-sm font-medium leading-relaxed">
          Drag your <code className="bg-white/10 px-1.5 py-0.5 rounded text-zinc-300">.aab</code> package into the secure audit chamber
        </p>
      </div>

      {!isLoading && (
        <div className="mt-4 px-8 py-3 bg-brand text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-brand/80 transition-all shadow-xl shadow-brand/20 relative z-10">
          Mount Source
        </div>
      )}
    </div>
  );
}

function AddFileModal({ isOpen, onClose, onAdd }: { isOpen: boolean, onClose: () => void, onAdd: (path: string, content: string | File) => void }) {
  const [path, setPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [useText, setUseText] = useState(true);
  const [textContent, setTextContent] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const validatePath = (val: string) => {
    if (!val) return null;
    // Allow alphanumeric, slashes, underscores, dots, hyphens
    const validChars = /^[a-zA-Z0-9._\-/]+$/;
    if (!validChars.test(val)) return "Invalid characters: only A-Z, 0-9, ., _, -, / are allowed";
    if (val.includes('//')) return "Double slashes are not allowed";
    if (val.startsWith('/') || val.endsWith('/')) return "Avoid leading or trailing slashes";
    if (!val.startsWith('base/') && !val.startsWith('BUNDLE-METADATA/') && !val.startsWith('META-INF/')) {
      return "Note: Paths in AABs typically start with 'base/'";
    }
    return null;
  };

  if (!isOpen) return null;

  const isPathWarning = error?.includes("typically start with 'base/'");
  const isPathError = error && !isPathWarning;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Add New File to Bundle</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Bundle Path</label>
            <input 
              type="text" 
              placeholder="e.g. base/assets/config.json"
              className={cn(
                "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 outline-none transition-all",
                isPathError ? "border-rose-300 focus:ring-rose-500/20 focus:border-rose-500" : 
                isPathWarning ? "border-amber-300 focus:ring-amber-500/20 focus:border-amber-500" :
                "focus:ring-blue-500/20 focus:border-blue-500"
              )}
              value={path}
              onChange={(e) => {
                const val = e.target.value;
                setPath(val);
                setError(validatePath(val));
              }}
            />
            {error && (
              <p className={cn(
                "text-[10px] flex items-center gap-1",
                isPathError ? "text-rose-500 font-medium" : "text-amber-600"
              )}>
                {isPathError ? <AlertCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                {error}
              </p>
            )}
            <p className="text-[10px] text-slate-400">Include folder structure. Core files reside in <code className="bg-slate-100 px-0.5 rounded">base/</code></p>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setUseText(true)}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                useText ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Text/Code
            </button>
            <button 
              onClick={() => setUseText(false)}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                !useText ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Upload File
            </button>
          </div>

          {useText ? (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Code/Content</label>
              <textarea 
                className="w-full h-48 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-mono text-sm resize-none"
                placeholder="// Enter your code or text here..."
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Select Local File</label>
              <input 
                type="file" 
                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
          )}
        </div>

        <div className="p-6 bg-slate-50 flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            Cancel
          </button>
          <button 
            disabled={!path || isPathError || (useText ? !textContent : !file)}
            onClick={() => onAdd(path, useText ? textContent : file!)}
            className="flex-1 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-slate-200"
          >
            Add to Bundle
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function MetadataManager({ 
  metadata, 
  onSave, 
  isLoading 
}: { 
  metadata: Metadata, 
  onSave: (m: Metadata) => void,
  isLoading: boolean 
}) {
  const [form, setForm] = useState<Metadata>(metadata);

  return (
    <div className="glass-dark rounded-[2rem] border border-white/5 overflow-hidden shadow-2xl relative group">
      <div className="absolute inset-0 bg-gradient-to-tr from-brand/5 via-transparent to-brand/5 opacity-50" />
      
      <div className="p-8 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10 bg-white/[0.01]">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex items-center justify-center border border-white/5 shadow-lg group-hover:border-brand transition-colors">
            <Settings className="w-6 h-6 text-zinc-400 group-hover:text-brand transition-colors" />
          </div>
          <div>
            <h3 className="font-black text-xl text-white tracking-tight uppercase">Registry Overrides</h3>
            <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Global Package Identity</p>
          </div>
        </div>
        <button 
          onClick={() => onSave(form)}
          disabled={isLoading}
          className="flex items-center justify-center gap-3 px-8 py-3 bg-brand text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-brand/80 transition-all shadow-xl shadow-brand/20 active:scale-95 disabled:opacity-50"
        >
          {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Commit Changes
        </button>
      </div>

      <div className="p-8 space-y-10 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
              <Building2 className="w-3 h-3" />
              Corporate Entity
            </label>
            <div className="relative">
              <input 
                type="text"
                className="w-full px-5 py-4 bg-zinc-950/50 border border-white/5 rounded-2xl text-zinc-300 focus:ring-2 focus:ring-brand/20 focus:border-brand/30 outline-none transition-all placeholder:text-zinc-700 font-medium"
                value={form.companyName}
                onChange={e => setForm({...form, companyName: e.target.value})}
                placeholder="e.g. Magnitude Labs"
              />
            </div>
          </div>
          <div className="space-y-3">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
              <ShieldCheck className="w-3 h-3" />
              DUNS Protocol ID
            </label>
            <input 
              type="text"
              className="w-full px-5 py-4 bg-zinc-950/50 border border-white/5 rounded-2xl text-zinc-300 focus:ring-2 focus:ring-brand/20 focus:border-brand/30 outline-none transition-all placeholder:text-zinc-700 font-mono font-bold"
              value={form.duns}
              onChange={e => setForm({...form, duns: e.target.value})}
              placeholder="000-000-000"
            />
          </div>
        </div>
        <div className="space-y-3">
          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
            <FileCode className="w-3 h-3" />
            Play Integrity Artifact / RSA Fragment
          </label>
          <div className="relative group/area">
            <div className="absolute -inset-1 bg-gradient-to-r from-brand/20 to-transparent rounded-[1.5rem] blur opacity-0 group-hover/area:opacity-100 transition-opacity" />
            <textarea 
              className="relative w-full h-40 px-5 py-4 bg-zinc-950 border border-white/5 rounded-2xl text-brand focus:ring-2 focus:ring-brand/20 focus:border-brand/30 outline-none font-mono text-[11px] leading-relaxed resize-none transition-all"
              value={form.token}
              onChange={e => setForm({...form, token: e.target.value})}
              placeholder='{ "key": "RSA_PUBLIC_BLOB" }'
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SmartAnalysis({ 
  bundleId, 
  onAnalyzing,
  onFixApplied,
  history
}: { 
  bundleId: string, 
  onAnalyzing: (loading: boolean) => void,
  onFixApplied: (files: BundleFile[], message: string, appliedChanges: string[]) => void,
  history: FixHistoryItem[]
}) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    onAnalyzing(true);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundleId }),
      });
      const data = await response.json();
      setAnalysis(data.analysis);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
      onAnalyzing(false);
    }
  };

  const runFix = async () => {
    if (!analysis) return;
    setIsFixing(true);
    onAnalyzing(true);
    try {
      const response = await fetch('/api/smart-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          bundleId, 
          issueDescription: "Fix the most critical issues identified in the previous analysis: " + analysis.substring(0, 1000)
        }),
      });
      
      if (!response.ok) throw new Error('Smart fix failed');
      
      const data = await response.json();
      onFixApplied(data.files, data.explanation, data.appliedChanges);
      runAnalysis();
    } catch (err) {
      console.error(err);
    } finally {
      setIsFixing(false);
      onAnalyzing(false);
    }
  };

  return (
    <div className="glass-dark rounded-[2rem] p-8 shadow-2xl border border-white/5 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full -mr-32 -mt-32 blur-3xl" />
      
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-brand rounded-2xl flex items-center justify-center shadow-lg shadow-brand/20">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-black text-xl text-white tracking-tight">AI MAGNITUDE ENGINE</h3>
            <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Heuristic Structural Remediation</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {history.length > 0 && (
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="px-4 py-2 text-[10px] font-black text-zinc-500 hover:text-white uppercase tracking-[0.2em] transition-colors"
            >
              LOGS [{history.length}]
            </button>
          )}
          <div className="flex gap-2">
            {analysis && (
              <button 
                onClick={runFix}
                disabled={isFixing || isAnalyzing}
                className="px-6 py-2.5 bg-emerald-500 text-white text-[10px] font-black rounded-xl uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 active:scale-95 disabled:opacity-50"
              >
                {isFixing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 mr-1 inline" />}
                Sync Fixes
              </button>
            )}
            <button 
              onClick={runAnalysis}
              disabled={isAnalyzing || isFixing}
              className="px-6 py-2.5 bg-brand text-white text-[10px] font-black rounded-xl uppercase tracking-widest hover:bg-brand/80 transition-all shadow-lg shadow-brand/20 active:scale-95 disabled:opacity-50"
            >
              {isAnalyzing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3 mr-1 inline" />}
              {analysis ? 'Recalibrate' : 'Begin Scan'}
            </button>
          </div>
        </div>
      </div>

      {showHistory && history.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mb-8 space-y-4 relative z-10"
        >
          <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4">Historical Mutations</div>
          <div className="space-y-3">
            {history.map((item, idx) => (
              <div key={idx} className="glass rounded-2xl p-4 border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-zinc-500 font-mono font-bold tracking-tighter">{new Date(item.timestamp).toLocaleString()}</span>
                  <div className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[9px] font-black rounded uppercase border border-emerald-500/20">Manifest Overwritten</div>
                </div>
                <p className="text-xs text-zinc-300 font-medium mb-3 leading-relaxed">{item.explanation}</p>
                <div className="flex flex-wrap gap-2">
                  {item.changes.map((path, pIdx) => (
                    <span key={pIdx} className="text-[9px] bg-white/5 text-zinc-500 px-2 py-1 rounded-lg font-mono font-bold">
                      {path.split('/').pop()}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="h-px bg-white/5 my-8" />
        </motion.div>
      )}

      {analysis && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10"
        >
          <div className="glass rounded-2xl p-6 border border-white/10 bg-white/[0.01]">
            <div className="markdown-body prose prose-invert prose-zinc max-w-none text-sm font-medium leading-relaxed text-zinc-400">
              <Markdown>{analysis}</Markdown>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function VersionHistory({ 
  versions, 
  currentIndex, 
  onRestore,
  isLoading 
}: { 
  versions: BundleVersion[], 
  currentIndex: number, 
  onRestore: (index: number) => void,
  isLoading: boolean 
}) {
  return (
    <div className="glass rounded-3xl overflow-hidden h-full flex flex-col bg-zinc-900/40">
      <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <RefreshCw className={cn("w-4 h-4 text-zinc-500", isLoading && "animate-spin")} />
          <h3 className="font-black text-white text-xs uppercase tracking-widest">State Ledger</h3>
        </div>
        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">{versions.length} checkpts</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {versions.map((v) => (
          <button
            key={v.index}
            onClick={() => onRestore(v.index)}
            disabled={isLoading || v.index === currentIndex}
            className={cn(
              "w-full text-left p-4 rounded-2xl border transition-all relative overflow-hidden group active:scale-[0.98]",
              v.index === currentIndex 
                ? "bg-brand/10 border-brand/30 shadow-[0_4px_20px_rgba(99,102,241,0.1)]" 
                : "bg-white/[0.03] border-white/5 hover:border-white/20 hover:bg-white/[0.05]"
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={cn(
                "text-[9px] font-black uppercase tracking-widest",
                v.index === currentIndex ? "text-brand" : "text-zinc-500"
              )}>
                {v.index === 0 ? "Source Root" : `Revision ${v.index}`}
              </span>
              <span className="text-[9px] text-zinc-500 font-mono font-bold">
                {new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className={cn(
              "text-xs font-bold truncate",
              v.index === currentIndex ? "text-white" : "text-zinc-400 group-hover:text-zinc-200"
            )}>
              {v.label}
            </p>
            {v.index === currentIndex && (
              <div className="absolute top-0 right-0 p-2">
                <div className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_8px_rgba(99,102,241,1)]" />
              </div>
            )}
          </button>
        ))}
      </div>
      <div className="p-4 bg-black/20 border-t border-white/5 italic text-[10px] text-zinc-600 font-medium text-center">
        Restoring branches forks the existing state.
      </div>
    </div>
  );
}

function AuditDashboard({ 
  report, 
  isLoading, 
  onRunAudit,
  onFixIssue,
  isFixing
}: { 
  report: AuditReport | null, 
  isLoading: boolean, 
  onRunAudit: () => void,
  onFixIssue: (issue: any) => void,
  isFixing: boolean
}) {
  return (
    <div className="glass rounded-3xl overflow-hidden flex flex-col h-full bg-zinc-900/40">
      <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-brand/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-brand" />
          </div>
          <h3 className="font-black text-white text-xs uppercase tracking-widest">Quality Assurance</h3>
        </div>
        <button 
          onClick={onRunAudit}
          disabled={isLoading}
          className="text-[10px] font-black text-brand uppercase tracking-[0.2em] hover:text-brand/80 disabled:opacity-50 transition-colors"
        >
          {isLoading ? "Auditing SDKs..." : "Deep Diagnostics"}
        </button>
      </div>

      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        {!report ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-10 opacity-40">
            <Archive className="w-10 h-10 text-white mb-4" />
            <p className="text-xs text-white font-medium">Initialize audit for full report</p>
          </div>
        ) : (
          <>
            {/* App Metadata Card */}
            <div className="glass-dark rounded-2xl p-5 space-y-4 relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-32 h-32 bg-brand/10 rounded-full -mr-16 -mt-16 blur-2xl transition-transform group-hover:scale-150" />
               <div className="flex items-center justify-between relative z-10">
                  <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">AAB Magnitude Identity</div>
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-0.5 rounded-full bg-brand/20 text-brand text-[10px] font-bold border border-brand/30">
                      {report.appInfo.framework}
                    </div>
                  </div>
               </div>
               <div className="relative z-10">
                  <h4 className="text-sm font-black truncate leading-tight tracking-tight mb-4 font-mono text-zinc-100">{report.appInfo.package}</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => onFixIssue({ type: 'VersionName', value: prompt("Enter new Version Name:", report.appInfo.versionName) })}
                      className="text-left group/btn p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] transition-all border border-white/5 active:scale-95"
                    >
                      <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight group-hover/btn:text-zinc-300 transition-colors">v.Name</div>
                      <div className="text-xs font-mono font-bold group-hover/btn:text-brand transition-colors truncate">{report.appInfo.versionName}</div>
                    </button>
                    <button 
                      onClick={() => onFixIssue({ type: 'VersionCode', value: prompt("Enter new Version Code:", report.appInfo.versionCode) })}
                      className="text-left group/btn p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] transition-all border border-white/5 active:scale-95"
                    >
                      <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-tight group-hover/btn:text-zinc-300 transition-colors">b.Code</div>
                      <div className="text-xs font-mono font-bold group-hover/btn:text-brand transition-colors truncate">{report.appInfo.versionCode}</div>
                    </button>
                  </div>
               </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Health Magnitude</div>
                <span className={cn(
                  "text-xl font-black font-mono",
                  report.score >= 90 ? "text-emerald-400" : report.score >= 70 ? "text-amber-400" : "text-rose-400"
                )}>
                  {report.score}%
                </span>
              </div>
              <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${report.score}%` }}
                  className={cn(
                    "h-full rounded-full transition-all duration-1000 shadow-[0_0_8px_rgba(var(--brand-rgb),0.5)]",
                    report.score >= 90 ? "bg-emerald-400" : report.score >= 70 ? "bg-amber-400" : "bg-rose-400"
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 glass-dark rounded-xl border border-white/5 space-y-1">
                <div className="text-[9px] font-black text-zinc-500 uppercase tracking-tighter">Target API</div>
                <div className="text-xs font-black text-white font-mono">{report.sdk.target}</div>
              </div>
              <div className="p-3 glass-dark rounded-xl border border-white/5 space-y-1">
                <div className="text-[9px] font-black text-zinc-500 uppercase tracking-tighter">Locales</div>
                <div className="text-xs font-black text-white font-mono">{report.localization.count} units</div>
              </div>
            </div>

            <div className="p-4 glass-dark rounded-2xl border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Play Integrity</div>
                <div className={cn(
                  "w-2 h-2 rounded-full animate-pulse shadow-[0_0_8px_currentColor]",
                  report.integrityToken.status === 'Valid' ? "text-emerald-400 bg-emerald-400" : 
                  report.integrityToken.status === 'Warning' ? "text-amber-400 bg-amber-400" : 
                  "text-zinc-600 bg-zinc-600"
                )} />
              </div>
              <p className="text-[10px] text-zinc-400 leading-relaxed font-medium italic">
                {report.integrityToken.message}
              </p>
            </div>

            {/* Smart Configuration Suggestions */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Heuristic Suggestions</div>
                <div className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-brand animate-pulse" />
                  <span className="text-[9px] font-black text-brand uppercase tracking-widest">AI Power</span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                {/* Target SDK Suggestion */}
                <div className="glass rounded-2xl p-4 border border-white/5 flex items-center justify-between group/suggest">
                  <div>
                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight mb-1">Target SDK</div>
                    <div className="text-xs font-black text-white">Current: API {report.sdk.target}</div>
                  </div>
                  {parseInt(report.sdk.target) < 34 && (
                    <button 
                      onClick={() => onFixIssue({ type: 'TargetSDK', value: '34' })}
                      className="px-3 py-1.5 bg-brand/10 border border-brand/30 text-brand text-[9px] font-black rounded-lg uppercase tracking-widest hover:bg-brand hover:text-white transition-all"
                    >
                      Boost to 34
                    </button>
                  )}
                </div>

                {/* Min SDK Suggestion */}
                <div className="glass rounded-2xl p-4 border border-white/5 flex items-center justify-between group/suggest">
                  <div>
                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight mb-1">Min SDK</div>
                    <div className="text-xs font-black text-white">Suggested: API 24</div>
                  </div>
                  <button 
                    onClick={() => onFixIssue({ type: 'MinSDK', value: '24' })}
                    className="px-3 py-1.5 bg-zinc-800 border border-white/5 text-zinc-400 text-[9px] font-black rounded-lg uppercase tracking-widest hover:text-white transition-all"
                  >
                    Adjust API
                  </button>
                </div>

                {/* Security Suggestion */}
                <div className="glass rounded-2xl p-4 border border-white/5 flex items-center justify-between group/suggest">
                  <div>
                    <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight mb-1">Network Security</div>
                    <div className="text-xs font-black text-white">Cleartext Traffic</div>
                  </div>
                  <button 
                    onClick={() => onFixIssue({ type: 'Cleartext', value: 'false' })}
                    className="px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[9px] font-black rounded-lg uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all"
                  >
                    Restrict
                  </button>
                </div>

                {/* Resource Suggestions */}
                {report.manifestIssues.some(i => i.type === 'Resource (Strings)') && (
                  <div className="glass rounded-2xl p-4 border border-white/5 flex items-center justify-between group/suggest">
                    <div>
                      <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight mb-1">String Conflicts</div>
                      <div className="text-xs font-black text-white">Duplicate Keys Found</div>
                    </div>
                    <button 
                      onClick={() => onFixIssue({ type: 'Resource (Strings)' })}
                      className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-black rounded-lg uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all"
                    >
                      Consolidate
                    </button>
                  </div>
                )}

                {report.manifestIssues.some(i => i.type === 'Optimization (Images)') && (
                  <div className="glass rounded-2xl p-4 border border-white/5 flex items-center justify-between group/suggest">
                    <div>
                      <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight mb-1">Heavy Assets</div>
                      <div className="text-xs font-black text-white">Large Images Detected</div>
                    </div>
                    <div className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-black rounded-lg uppercase tracking-widest">
                      WebP Recommended
                    </div>
                  </div>
                )}
              </div>
            </div>

            {report.manifestIssues.length > 0 && (
              <div className="space-y-4">
                <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Remediation Engine</div>
                {report.manifestIssues.map((issue, i) => (
                  <div key={i} className={cn(
                    "p-4 rounded-2xl glass border group transition-all hover:bg-white/[0.05]",
                    issue.severity === 'Critical' ? "border-rose-500/20" : "border-amber-500/20"
                  )}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className={cn(
                            "text-[10px] font-black uppercase tracking-tight",
                            issue.severity === 'Critical' ? "text-rose-400" : "text-amber-400"
                          )}>
                            {issue.type}
                          </span>
                          <button
                            onClick={() => onFixIssue(issue)}
                            disabled={isFixing}
                            className="bg-brand text-white text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all flex items-center gap-1"
                          >
                            {isFixing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Zap className="w-2.5 h-2.5" />}
                            Execute
                          </button>
                        </div>
                        <p className="text-[11px] text-zinc-300 font-medium leading-relaxed">
                          {issue.message}
                        </p>
                        {issue.suggestion && (
                          <p className="text-[10px] text-zinc-500 italic">
                            Suggestion: {issue.suggestion}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function BundleExplorer({ 
  bundle, 
  onReplace, 
  onDownload,
  onAdd,
  onFixApplied,
  history,
  versions,
  onRestore,
  isVersioning,
  integrityScore,
  onRunAudit,
  isAuditing,
  auditReport,
  onFixIssue,
  isFixing,
  onBatchAction
}: { 
  bundle: Bundle, 
  onReplace: (targetPath: string, file: File) => void,
  onDownload: () => void,
  onAdd: (path: string, content: string | File) => void,
  onFixApplied: (files: BundleFile[], message: string, appliedChanges: string[]) => void,
  history: FixHistoryItem[],
  versions: { items: BundleVersion[], currentIndex: number },
  onRestore: (index: number) => void,
  isVersioning: boolean,
  integrityScore: { score: number, issues: string[], warnings: string[] } | null,
  onRunAudit: () => void,
  isAuditing: boolean,
  auditReport: AuditReport | null,
  onFixIssue: (issue: any) => void,
  isFixing: boolean,
  onBatchAction: (action: 'delete' | 'export', paths: string[]) => Promise<void>
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [replacingFile, setReplacingFile] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSaveToWorkspaceModalOpen, setIsSaveToWorkspaceModalOpen] = useState(false);
  const [isAIAnalyzing, setIsAIAnalyzing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const filteredFiles = bundle.files.filter(f => 
    !f.isDirectory && f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleSelection = (path: string) => {
    const next = new Set(selectedFiles);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setSelectedFiles(next);
  };

  const toggleAll = () => {
    if (selectedFiles.size === filteredFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(filteredFiles.map(f => f.name)));
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (name: string) => {
    if (name.endsWith('.xml') || name.endsWith('.json')) return <FileCode className="w-4 h-4 text-emerald-400" />;
    if (name.match(/\.(png|jpg|jpeg|webp|svg)$/i)) return <ImageIcon className="w-4 h-4 text-blue-400" />;
    return <File className="w-4 h-4 text-zinc-500" />;
  };

  return (
    <div className="space-y-12">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-brand/10 border border-brand/20 rounded-xl flex items-center justify-center">
                <Archive className="w-5 h-5 text-brand" />
             </div>
             <span className="text-[10px] font-black text-brand uppercase tracking-[0.3em]">Volume Mounted</span>
          </div>
          <h2 className="text-5xl font-black text-white tracking-tighter uppercase leading-none">{bundle.name}</h2>
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-2 text-zinc-500 font-bold text-[11px] uppercase tracking-widest bg-zinc-950/40 px-3 py-1.5 rounded-lg border border-white/5">
              <FolderOpen className="w-3.5 h-3.5 text-zinc-600" />
              {bundle.files.length} Nodes
            </span>
            <span className="flex items-center gap-2 text-emerald-500 font-bold text-[11px] uppercase tracking-widest bg-emerald-500/5 px-3 py-1.5 rounded-lg border border-emerald-500/10">
              <ShieldCheck className="w-3.5 h-3.5" />
              Integrity Verified
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <AnimatePresence>
            {selectedFiles.size > 0 && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-2 p-1.5 bg-zinc-900 border border-brand/20 rounded-2xl"
              >
                <div className="px-3 py-1.5 text-[10px] font-black text-brand uppercase tracking-widest bg-brand/5 rounded-xl border border-brand/10">
                  {selectedFiles.size} Selected
                </div>
                <button 
                  onClick={() => onBatchAction('export', Array.from(selectedFiles))}
                  className="p-2.5 text-zinc-400 hover:text-white transition-colors"
                  title="Export Selection as ZIP"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => {
                    if (confirm(`Delete ${selectedFiles.size} files from bundle?`)) {
                      onBatchAction('delete', Array.from(selectedFiles));
                      setSelectedFiles(new Set());
                    }
                  }}
                  className="p-2.5 text-rose-500/50 hover:text-rose-500 transition-colors"
                  title="Delete Selection"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="px-8 py-4 bg-zinc-900 text-zinc-400 border border-white/5 rounded-2xl font-black uppercase text-xs tracking-widest hover:text-white hover:border-white/20 transition-all active:scale-95"
          >
            Inject Logic
          </button>
          <button 
            onClick={() => setIsSaveToWorkspaceModalOpen(true)}
            className="flex items-center gap-2 px-8 py-4 bg-zinc-900 text-zinc-400 border border-white/5 rounded-2xl font-black uppercase text-xs tracking-widest hover:text-white hover:border-white/20 transition-all active:scale-95"
          >
            <Save className="w-4 h-4" />
            Save to Workspace
          </button>
          <button 
            onClick={onDownload}
            disabled={integrityScore && integrityScore.score < 100}
            className={cn(
              "flex items-center gap-3 px-10 py-5 text-white rounded-[1.5rem] font-black uppercase text-xs tracking-[0.2em] transition-all shadow-2xl active:scale-95 group",
              integrityScore && integrityScore.score < 100 
                ? "bg-zinc-800 text-zinc-600 border border-white/5 opacity-50 cursor-not-allowed" 
                : "bg-brand hover:brightness-110 shadow-brand/40"
            )}
          >
            <Download className="w-5 h-5 group-hover:translate-y-1 transition-transform" />
            Finalize .aab
          </button>
        </div>
      </div>

      <AddFileModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onAdd={(path, content) => {
          onAdd(path, content);
          setIsAddModalOpen(false);
        }}
      />

      <SaveToWorkspaceModal 
        isOpen={isSaveToWorkspaceModalOpen}
        onClose={() => setIsSaveToWorkspaceModalOpen(false)}
        bundleId={bundle.bundleId}
        defaultName={bundle.name}
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
        <div className="xl:col-span-8 space-y-10">
          {integrityScore && (
            <div className="glass-dark rounded-[2.5rem] p-10 border border-white/5 relative overflow-hidden group">
              <div className="absolute -top-24 -left-24 w-64 h-64 bg-brand/5 rounded-full blur-3xl opacity-50 transition-transform group-hover:scale-150" />
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-10 relative z-10">
                <div className="flex items-center gap-6">
                  <div className={cn(
                    "w-20 h-20 rounded-[2rem] flex items-center justify-center shadow-2xl",
                    integrityScore.score === 100 ? "bg-emerald-500 shadow-emerald-500/20" : 
                    integrityScore.issues.length > 0 ? "bg-rose-500 shadow-rose-500/20" : "bg-amber-500 shadow-amber-500/20"
                  )}>
                    {integrityScore.score === 100 ? <ShieldCheck className="w-10 h-10 text-white" /> : <AlertTriangle className="w-10 h-10 text-white" />}
                  </div>
                  <div>
                    <h4 className="font-black text-3xl text-white tracking-tighter uppercase">Magnitude Readiness</h4>
                    <p className="text-zinc-500 font-bold uppercase tracking-widest text-[11px] mt-1">
                      Signal Integrity: <span className="text-zinc-100">{integrityScore.score}% Optimal</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                   {bundle.files.reduce((acc, f) => acc + f.size, 0) > 50 * 1024 * 1024 && (
                     <div className="flex items-center gap-2 px-4 py-2 bg-zinc-950 text-amber-400 rounded-xl text-[10px] font-black uppercase tracking-widest border border-amber-400/20">
                       <Zap className="w-3.5 h-3.5 fill-current" />
                       High Capacity
                     </div>
                   )}
                   <span className={cn(
                    "px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all glass border",
                    integrityScore.score === 100 ? "text-emerald-400 border-emerald-400/20" : 
                    integrityScore.issues.length > 0 ? "text-rose-400 border-rose-400/20" : "text-amber-400 border-amber-400/20"
                  )}>
                    {integrityScore.score === 100 ? "Ready for Store" : integrityScore.issues.length > 0 ? "Critical Conflict" : "Store Warning"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10 relative z-10">
                {integrityScore.issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-4 text-[11px] text-rose-400 bg-rose-500/5 p-5 rounded-2xl border border-rose-400/10">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span className="font-bold leading-relaxed">{issue}</span>
                  </div>
                ))}
                {integrityScore.warnings.map((warning, i) => (
                  <div key={i} className="flex items-start gap-4 text-[11px] text-amber-400 bg-amber-500/5 p-5 rounded-2xl border border-amber-400/10">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span className="font-bold leading-relaxed">{warning}</span>
                  </div>
                ))}
                {integrityScore.score === 100 && (
                  <div className="col-span-full py-8 text-center glass rounded-3xl border border-emerald-400/10">
                    <p className="text-emerald-400 font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3">
                       <CheckCircle2 className="w-6 h-6" />
                       Structural Parity Achieved
                    </p>
                  </div>
                )}
              </div>

              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden relative z-10">
                <motion.div 
                   initial={{ width: 0 }}
                   animate={{ width: `${integrityScore.score}%` }}
                   className={cn(
                     "h-full rounded-full transition-all duration-1000 shadow-[0_0_20px_rgba(var(--brand-rgb),0.3)]",
                     integrityScore.score === 100 ? "bg-emerald-500" : "bg-amber-500"
                   )}
                />
              </div>
            </div>
          )}

          <SmartAnalysis 
            bundleId={bundle.bundleId} 
            onAnalyzing={setIsAIAnalyzing} 
            onFixApplied={onFixApplied}
            history={history}
          />

          <ApkSigner 
            bundleId={bundle.bundleId}
            onSignSuccess={(files, message, changes) => {
              onFixApplied(files, message, changes);
            }}
          />
        </div>

        <div className="xl:col-span-4 space-y-10">
          <AuditDashboard 
            report={auditReport} 
            isLoading={isAuditing} 
            onRunAudit={onRunAudit} 
            onFixIssue={onFixIssue}
            isFixing={isFixing}
          />
          <VersionHistory 
            versions={versions.items} 
            currentIndex={versions.currentIndex} 
            onRestore={onRestore}
            isLoading={isVersioning}
          />
        </div>
      </div>

      <div className="glass-dark rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl">
        <div className="p-8 border-b border-white/5 flex items-center gap-6 bg-white/[0.01]">
          <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center">
            <Search className="w-6 h-6 text-zinc-500" />
          </div>
          <input 
            type="text"
            placeholder="Search artifacts (AndroidManifest.xml, res/drawable...)"
            className="flex-1 bg-transparent border-none outline-none text-zinc-100 font-bold placeholder:text-zinc-700 text-lg"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="max-h-[700px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-zinc-950/20 sticky top-0 z-10 backdrop-blur-md">
              <tr>
                <th className="px-10 py-5 w-10 bg-zinc-950/40">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 rounded border-white/10 bg-white/5 text-brand focus:ring-brand accent-brand transition-all cursor-pointer"
                    checked={selectedFiles.size === filteredFiles.length && filteredFiles.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-10 py-5 text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] bg-zinc-950/40">Resource Identifier</th>
                <th className="px-10 py-5 text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] text-right bg-zinc-950/40">Density</th>
                <th className="px-10 py-5 text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] text-right bg-zinc-950/40">Logic</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredFiles.map((file, idx) => (
                <tr 
                  key={idx} 
                  className={cn(
                    "hover:bg-white/[0.03] transition-colors group cursor-pointer",
                    selectedFiles.has(file.name) && "bg-brand/5"
                  )}
                  onClick={() => toggleSelection(file.name)}
                >
                  <td className="px-10 py-6 w-10" onClick={(e) => e.stopPropagation()}>
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-white/10 bg-white/5 text-brand focus:ring-brand accent-brand transition-all cursor-pointer"
                      checked={selectedFiles.has(file.name)}
                      onChange={() => toggleSelection(file.name)}
                    />
                  </td>
                  <td className="px-10 py-6">
                    <div className="flex items-center gap-5">
                      <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-white/5 group-hover:border-brand/40 flex items-center justify-center transition-colors">
                        {getFileIcon(file.name)}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold text-zinc-300 truncate tracking-tight group-hover:text-white transition-colors" title={file.name}>
                          {file.name}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-10 py-6 text-right">
                    <span className="text-[11px] font-black text-zinc-500 font-mono tracking-tighter uppercase">{formatSize(file.size)}</span>
                  </td>
                  <td className="px-10 py-6 text-right" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => {
                        setReplacingFile(file.name);
                        replaceInputRef.current?.click();
                      }}
                      className="text-[10px] font-black text-brand uppercase tracking-widest opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all hover:brightness-125 px-4 py-2 bg-brand/10 rounded-lg border border-brand/20 shadow-sm"
                    >
                      Overwrite
                    </button>
                  </td>
                </tr>
              ))}
              {filteredFiles.length === 0 && (
                <tr>
                   <td colSpan={4} className="px-10 py-24 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-20">
                      <FileCode className="w-12 h-12 text-white" />
                      <p className="text-xs text-white font-black uppercase tracking-[0.2em]">Zero Collisions Found</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <input 
        type="file" 
        ref={replaceInputRef} 
        className="hidden" 
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && replacingFile) {
            onReplace(replacingFile, file);
            setReplacingFile(null);
          }
        }}
      />
    </div>
  );
}

export default function App() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [metadata, setMetadata] = useState<Metadata>({
    companyName: 'Jessica bright company Justbeyou',
    duns: '749068766',
    token: '{\n  "token": "a_very_long_encrypted_string_from_the_play_integrity_api"\n}'
  });
  const [history, setHistory] = useState<FixHistoryItem[]>([]);
  const [versions, setVersions] = useState<{ items: BundleVersion[], currentIndex: number }>({ items: [], currentIndex: 0 });
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isVersioning, setIsVersioning] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [firestoreStatus, setFirestoreStatus] = useState<{ active: boolean, loading: boolean }>({ active: false, loading: true });
  const [integrityScore, setIntegrityScore] = useState<{ score: number, issues: string[], warnings: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isFixing, setIsFixing] = useState(false);

  const handleFixIssue = async (issue: any) => {
    if (!bundle || (issue.type.includes('Version') && !issue.value)) return;
    setIsFixing(true);
    try {
      const response = await fetch('/api/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: 'bundle',
          method: 'fix_manifest',
          arguments: { 
            bundleId: bundle.bundleId, 
            issueType: issue.type,
            value: issue.value 
          }
        })
      });
      const data = await response.json();
      if (data.status === 'success') {
        setSuccess("Fix applied successfully. Re-syncing bundle...");
        
        // Refresh bundle file list to reflect changes
        const bundleId = bundle.bundleId;
        const stateRes = await fetch(`/api/version/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bundleId, index: versions.currentIndex + 1 }) // The fix creates a new version
        });
        
        if (stateRes.ok) {
          const stateData = await stateRes.json();
          setBundle({ ...bundle, files: stateData.files });
          fetchHistory(bundleId);
          // Auto-re-audit
          setTimeout(() => handleRunAudit(), 500);
        }
      } else {
        setError(data.message || "Could not apply fix automatically.");
      }
    } catch (e) {
      setError("Failed to connect to fix service.");
    } finally {
      setIsFixing(false);
    }
  };

  React.useEffect(() => {
    if (bundle) {
      // AAB Linter & Static Analysis
      const issues: string[] = [];
      const warnings: string[] = [];
      const hasBase = bundle.files.some(f => f.name.startsWith('base/'));
      const hasManifest = bundle.files.some(f => f.name === 'base/manifest/AndroidManifest.xml');
      const hasResources = bundle.files.some(f => f.name === 'base/resources.pb');
      const hasAssets = bundle.files.some(f => f.name.startsWith('base/assets/'));
      const hasSigning = bundle.files.some(f => f.name.startsWith('META-INF/'));
      
      const locales = bundle.files
        .filter(f => f.name.includes('base/res/values-'))
        .map(f => f.name.split('/')[2].replace('values-', ''));
      const uniqueLocales = [...new Set(locales)];

      // Structural Criticals
      if (!hasBase) issues.push("Missing 'base/' module - structural integrity failed.");
      if (!hasManifest) issues.push("CRITICAL: AndroidManifest.xml not found at 'base/manifest/'. App will fail to install.");
      if (!hasResources) issues.push("CRITICAL: 'base/resources.pb' missing. Bundle is invalid.");
      
      // Structural Warnings (Lint)
      if (!hasAssets) warnings.push("No assets detected in 'base/assets/'. Essential for most production apps.");
      if (uniqueLocales.length === 0) warnings.push("Single-locale bundle: No additional language resources detected.");
      if (hasSigning) warnings.push("META-INF/ signature files detected. Play Console expects an unsigned bundle for its signing process.");
      
      // Large file linting
      const largeFiles = bundle.files.filter(f => f.size > 10 * 1024 * 1024); // 10MB
      if (largeFiles.length > 0) {
        warnings.push(`Detected ${largeFiles.length} files over 10MB. Large bundles may require Play Feature Delivery.`);
      }

      // Root file linting
      const rootFiles = bundle.files.filter(f => !f.name.includes('/') && f.name !== 'BundleConfig.pb');
      if (rootFiles.length > 0) {
        warnings.push(`Non-standard files found in bundle root: ${rootFiles.map(f => f.name).join(', ')}.`);
      }

      const score = Math.max(0, 100 - (issues.length * 30) - (warnings.length * 5));
      
      setIntegrityScore({ score, issues, warnings });
    }
  }, [bundle]);

  React.useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch('/api/status/firestore');
        const data = await response.json();
        setFirestoreStatus({ active: data.active, loading: false });
      } catch (err) {
        setFirestoreStatus({ active: false, loading: false });
      }
    };
    checkStatus();
  }, []);

  React.useEffect(() => {
    const loadMetadata = async () => {
      try {
        const response = await fetch('/api/metadata/global');
        if (response.ok) {
          const data = await response.json();
          if (data.companyName) {
            setMetadata({
              companyName: data.companyName,
              duns: data.duns,
              token: data.token
            });
          }
        }
      } catch (err) {
        console.error('Failed to load metadata', err);
      }
    };
    loadMetadata();
  }, []);

  const handleSaveMetadata = async (m: Metadata) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await fetch('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bundleId: bundle?.bundleId || 'global',
          ...m
        }),
      });
      
      if (!response.ok) throw new Error('Failed to save metadata');
      
      setMetadata(m);
      setSuccess('Metadata saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save metadata');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHistory = async (bundleId: string) => {
    try {
      const response = await fetch(`/api/version/history/${bundleId}`);
      if (response.ok) {
        const data = await response.json();
        setVersions({ items: data.history, currentIndex: data.currentIndex });
      }
    } catch (err) {
      console.error('Failed to fetch history', err);
    }
  };

  const handleRestore = async (index: number) => {
    if (!bundle) return;
    setIsVersioning(true);
    try {
      const response = await fetch('/api/version/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundleId: bundle.bundleId, index }),
      });
      
      if (!response.ok) throw new Error('Failed to restore version');
      
      const data = await response.json();
      setBundle({ ...bundle, files: data.files });
      setVersions(prev => ({ ...prev, currentIndex: index }));
      setSuccess(`Restored to version ${index === 0 ? "Original" : "v" + index}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore version');
    } finally {
      setIsVersioning(false);
    }
  };

  const handleRunAudit = async () => {
    if (!bundle) return;
    setIsAuditing(true);
    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundleId: bundle.bundleId }),
      });
      if (response.ok) {
        const data = await response.json();
        setAuditReport(data);
      }
    } catch (err) {
      console.error('Audit failed', err);
    } finally {
      setIsAuditing(false);
    }
  };

  const handleUpload = async (file: File) => {
    setIsLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('Failed to upload file');
      
      const data = await response.json();
      setBundle(data);
      fetchHistory(data.bundleId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during upload');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshBundle = async (bundleId: string) => {
    try {
      const response = await fetch(`/api/bundle/${bundleId}`);
      if (response.ok) {
        const data = await response.json();
        setBundle(data);
      }
    } catch (err) {
      console.error('Failed to refresh bundle', err);
    }
  };

  const handleReplace = async (targetPath: string, file: File) => {
    if (!bundle) return;
    
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('bundleId', bundle.bundleId);
    formData.append('targetPath', targetPath);

    try {
      const response = await fetch('/api/replace-file', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('Failed to replace file');
      
      await refreshBundle(bundle.bundleId);
      fetchHistory(bundle.bundleId);
      setSuccess(`Successfully replaced ${targetPath.split('/').pop()}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during replacement');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!bundle) return;
    window.location.href = `/api/download/${bundle.bundleId}`;
  };

  const handleAddFile = async (targetPath: string, content: string | File) => {
    if (!bundle) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append('bundleId', bundle.bundleId);
    formData.append('targetPath', targetPath);

    if (typeof content === 'string') {
      formData.append('textContent', content);
    } else {
      formData.append('file', content);
    }

    try {
      const response = await fetch('/api/add-file', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Failed to add file to bundle');

      const data = await response.json();
      setBundle({ ...bundle, files: data.files });
      fetchHistory(bundle.bundleId);
      setSuccess(`Successfully added ${targetPath}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while adding file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBatchAction = async (action: 'delete' | 'export', paths: string[]) => {
    if (!bundle) return;
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (action === 'delete') {
        const response = await fetch('/api/batch-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bundleId: bundle.bundleId, filePaths: paths })
        });
        if (!response.ok) throw new Error('Batch delete failed');
        const data = await response.json();
        setBundle({ ...bundle, files: data.files });
        fetchHistory(bundle.bundleId);
        setSuccess(`Deleted ${paths.length} files`);
      } else if (action === 'export') {
        const response = await fetch('/api/batch-export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bundleId: bundle.bundleId, filePaths: paths })
        });
        if (!response.ok) throw new Error('Batch export failed');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `exported_assets_${new Date().getTime()}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setSuccess(`Exported ${paths.length} files as ZIP`);
      }
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch action failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 font-sans flex flex-col selection:bg-brand/30 selection:text-white">
      {/* Dynamic Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brand/10 rounded-full blur-[120px] -translate-y-1/2" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-brand/5 rounded-full blur-[140px] translate-y-1/2" />
        <div className="absolute inset-0 grid-bg opacity-30" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-white/5 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-6 sm:px-10 h-24 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="w-12 h-12 bg-zinc-950 border border-white/10 rounded-2xl flex items-center justify-center group cursor-pointer hover:border-brand/50 transition-all shadow-2xl">
              <Archive className="w-6 h-6 text-brand group-hover:scale-110 transition-transform" />
            </div>
            <div className="space-y-1">
              <h1 className="font-black text-white tracking-tighter text-2xl uppercase leading-none italic">EDIT.ABB</h1>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em] leading-none">Magnitude Audit Engine</span>
                <div 
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    firestoreStatus.loading ? "bg-zinc-800 animate-pulse" : 
                    firestoreStatus.active ? "bg-emerald-500 shadow-[0_0_10px_#10b981]" : "bg-zinc-700"
                  )}
                />
              </div>
            </div>
          </div>
          
          <nav className="hidden md:flex items-center gap-12">
            {['Architecture', 'Compliance', 'Security', 'Artifacts'].map((item) => (
              <a key={item} href="#" className="text-[11px] font-black text-zinc-500 hover:text-white uppercase tracking-[0.2em] transition-colors">{item}</a>
            ))}
          </nav>

          <div className="flex items-center gap-6">
            <div className="hidden lg:flex flex-col items-end">
              <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Core Status</span>
              <span className="text-[11px] font-bold text-zinc-300">Synchronized</span>
            </div>
            <button className="px-6 py-2.5 bg-white text-black text-[11px] font-black rounded-xl uppercase tracking-widest hover:bg-zinc-200 transition-all active:scale-95">Access Terminal</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-6 sm:px-10 py-12 lg:py-24 relative z-10">
        <AnimatePresence mode="wait">
          {!bundle ? (
            <motion.div
              key="upload-view"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-4xl mx-auto text-center"
            >
              <div className="mb-20 space-y-10">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand/10 border border-brand/20 rounded-full"
                >
                  <Sparkles className="w-3.5 h-3.5 text-brand" />
                  <span className="text-[10px] font-black text-brand uppercase tracking-widest">Version 4.0.0 Core</span>
                </motion.div>
                
                <h2 className="text-6xl sm:text-7xl md:text-8xl font-black text-white tracking-tighter uppercase leading-[0.95] text-balance">
                  Master Your <br />
                  <span className="text-brand">Artifacts</span>
                </h2>
                
                <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto font-medium leading-relaxed">
                  The ultimate directive for high-magnitude <code className="bg-white/5 px-2 py-1 rounded text-zinc-200 font-mono">.aab</code> manipulation. 
                  Audit, modify, and deploy across Flutter, Unity, and Native SDKs.
                </p>
              </div>

              <div className="max-w-2xl mx-auto">
                <FileUploader onUpload={handleUpload} isLoading={isLoading} />
              </div>
              
              <div className="mt-32 grid grid-cols-1 md:grid-cols-3 gap-12 text-left">
                {[
                  { icon: RefreshCw, title: 'Asset Mutation', desc: 'Surgically replace binary resources, strings, and manifests without source access.' },
                  { icon: Search, title: 'Deep Heuristics', desc: 'Analyze structural weaknesses and Play Store compliance issues in real-time.' },
                  { icon: ShieldCheck, title: 'Secure Storage', desc: 'Encrypted buffer zones ensure your IP remains confidential during the audit process.' }
                ].map((feature, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + (i * 0.1) }}
                    className="p-8 glass-dark rounded-[2rem] border border-white/5 hover:border-brand/20 transition-all group"
                  >
                    <div className="w-12 h-12 bg-zinc-950 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                      <feature.icon className="w-6 h-6 text-brand" />
                    </div>
                    <h4 className="font-black text-white mb-3 uppercase tracking-tight text-lg">{feature.title}</h4>
                    <p className="text-sm text-zinc-500 leading-relaxed font-medium">{feature.desc}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="editor-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-16"
            >
              <div className="flex items-center gap-3 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-600 mb-4">
                <button 
                  onClick={() => setBundle(null)}
                  className="hover:text-white transition-colors"
                >
                  DE-MOUNT
                </button>
                <ChevronRight className="w-4 h-4 text-zinc-800" />
                <span className="text-zinc-400">MANIFEST EDITOR</span>
              </div>

              <BundleExplorer 
                bundle={bundle} 
                onReplace={handleReplace} 
                onDownload={handleDownload}
                onAdd={handleAddFile}
                history={history}
                versions={versions}
                onRestore={handleRestore}
                isVersioning={isVersioning}
                integrityScore={integrityScore}
                onRunAudit={handleRunAudit}
                isAuditing={isAuditing}
                auditReport={auditReport}
                onFixIssue={handleFixIssue}
                isFixing={isFixing}
                onBatchAction={handleBatchAction}
                onFixApplied={(files, message, appliedChanges) => {
                  setBundle({ ...bundle, files });
                  fetchHistory(bundle.bundleId);
                  setHistory(prev => [{
                    timestamp: new Date().toISOString(),
                    explanation: message,
                    changes: appliedChanges
                  }, ...prev]);
                  setSuccess(`Heuristic Applied: ${message}`);
                }}
              />

              <MetadataManager 
                metadata={metadata}
                onSave={handleSaveMetadata}
                isLoading={isLoading}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Persistence Notifications */}
      <div className="fixed bottom-10 right-10 flex flex-col gap-4 z-[100]">
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-dark border border-rose-500/30 text-rose-400 px-8 py-5 rounded-2xl shadow-2xl flex items-center gap-4 backdrop-blur-2xl"
            >
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Critical Error</p>
                <p className="text-sm font-bold">{error}</p>
              </div>
            </motion.div>
          )}
          {success && (
            <motion.div
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-dark border border-brand/30 text-brand px-8 py-5 rounded-2xl shadow-2xl flex items-center gap-4 backdrop-blur-2xl"
            >
              <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-50">System Success</p>
                <p className="text-sm font-bold">{success}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <footer className="mt-auto py-20 border-t border-white/5 relative z-10">
        <div className="max-w-[1600px] mx-auto px-10 flex flex-col md:flex-row items-center justify-between gap-10">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-zinc-950 rounded-xl flex items-center justify-center border border-white/5">
              <Archive className="w-5 h-5 text-brand" />
            </div>
            <div>
              <p className="text-[10px] font-black text-white uppercase tracking-widest leading-none">EDIT.ABB CORE</p>
              <p className="text-[9px] font-bold text-zinc-600 uppercase mt-1">Terminal Production Edition</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-10">
            {['Terms', 'Privacy', 'Security', 'Github', 'Status'].map((link) => (
              <a key={link} href="#" className="text-[10px] font-black text-zinc-600 hover:text-white uppercase tracking-[0.2em] transition-colors">{link}</a>
            ))}
          </div>
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest italic">&copy; 2024 MAGNITUDE FOUNDATION</p>
        </div>
      </footer>
    </div>
  );
}

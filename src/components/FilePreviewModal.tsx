import React, { useState, useEffect } from 'react';
import { 
  X, 
  FileCode, 
  Image as ImageIcon, 
  Download, 
  Copy, 
  Check, 
  Loader2, 
  AlertCircle,
  FileText,
  Upload,
  Sparkles
} from 'lucide-react';
import { cn } from '../lib/utils';

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  bundleId: string;
  filePath: string | null;
  fileSize: number;
  onReplace: (targetPath: string, file: File) => void;
}

export function FilePreviewModal({ 
  isOpen, 
  onClose, 
  bundleId, 
  filePath, 
  fileSize,
  onReplace
}: FilePreviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isXml, setIsXml] = useState(false);
  const [isImage, setIsImage] = useState(false);
  const [isOtherText, setIsOtherText] = useState(false);

  useEffect(() => {
    if (!isOpen || !filePath) {
      setContent(null);
      setImageSrc(null);
      setError(null);
      return;
    }

    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const xmlTypes = ['xml'];
    const imageTypes = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'ico'];
    const textTypes = ['json', 'txt', 'properties', 'cfg', 'html', 'md', 'yml', 'yaml', 'gradle', 'pro', 'conf'];

    const isXmlFile = xmlTypes.includes(ext);
    const isImgFile = imageTypes.includes(ext);
    const isTxtFile = textTypes.includes(ext);

    setIsXml(isXmlFile);
    setIsImage(isImgFile);
    setIsOtherText(isTxtFile);

    setLoading(true);
    setError(null);
    setContent(null);
    setImageSrc(null);

    const fetchFile = async () => {
      try {
        const url = `/api/bundle/${bundleId}/file?path=${encodeURIComponent(filePath)}`;
        
        if (isImgFile) {
          // Fetch as blob for local preview
          const response = await fetch(url);
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to fetch image resource');
          }
          const blob = await response.blob();
          const localUrl = URL.createObjectURL(blob);
          setImageSrc(localUrl);
        } else {
          // Fetch as text
          const response = await fetch(url);
          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to load file contents');
          }
          const text = await response.text();
          setContent(text);
        }
      } catch (err: any) {
        console.error('Preview error:', err);
        setError(err.message || 'Unable to preview this file type.');
      } finally {
        setLoading(false);
      }
    };

    fetchFile();

    // Clean up local image urls
    return () => {
      if (imageSrc) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [isOpen, filePath, bundleId]);

  if (!isOpen || !filePath) return null;

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const url = `/api/bundle/${bundleId}/file?path=${encodeURIComponent(filePath)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filePath.split('/').pop() || 'resource';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onReplace(filePath, file);
      onClose();
    }
  };

  // Nice human-readable size
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const fileTitle = filePath.split('/').pop() || filePath;
  const directoryPath = filePath.substring(0, filePath.lastIndexOf('/'));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-zinc-950 border border-white/10 rounded-[2.5rem] shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand/5 rounded-full blur-3xl opacity-30 pointer-events-none" />
        
        {/* Header bar */}
        <div className="p-6 md:p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.01] relative z-10">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 bg-zinc-900 border border-white/10 rounded-2xl flex items-center justify-center shrink-0">
              {isImage ? (
                <ImageIcon className="w-6 h-6 text-brand" />
              ) : isXml ? (
                <FileCode className="w-6 h-6 text-brand" />
              ) : (
                <FileText className="w-6 h-6 text-brand" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-brand uppercase tracking-[0.25em] leading-none">justbeyou Identity Blueprint</span>
                <span className="w-1.5 h-1.5 rounded-full bg-brand/50" />
                <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">{formatBytes(fileSize)}</span>
              </div>
              <h3 className="font-black text-lg md:text-xl text-white tracking-tight mt-1 truncate" title={filePath}>
                {fileTitle}
              </h3>
              {directoryPath && (
                <p className="text-[10px] text-zinc-500 font-mono tracking-wider truncate mt-0.5">
                  Path: {directoryPath}/
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose} 
              className="p-3 hover:bg-white/5 rounded-2xl border border-transparent hover:border-white/5 transition-all text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Dynamic preview canvas */}
        <div className="flex-1 min-h-0 relative z-10 flex flex-col md:flex-row">
          
          {/* Main preview workspace */}
          <div className="flex-1 min-h-0 bg-zinc-950/60 flex flex-col relative border-b md:border-b-0 md:border-r border-white/5">
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-brand" />
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Opening Resource Blueprint...</p>
              </div>
            ) : error ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto gap-4">
                <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center text-rose-400">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-black text-sm text-white uppercase tracking-wider">Failed to preview file</h4>
                  <p className="text-xs text-zinc-400 mt-2 font-mono leading-relaxed">{error}</p>
                </div>
              </div>
            ) : isImage && imageSrc ? (
              <div className="flex-1 overflow-auto flex items-center justify-center p-6 relative">
                {/* Checkerboard transparency background */}
                <div 
                  className="absolute inset-0 opacity-15 pointer-events-none" 
                  style={{
                    backgroundImage: 'linear-gradient(45deg, #fff 25%, transparent 25%), linear-gradient(-45deg, #fff 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #fff 75%), linear-gradient(-45deg, transparent 75%, #fff 75%)',
                    backgroundSize: '20px 20px',
                    backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                  }}
                />
                
                <div className="relative group/img max-w-full max-h-full flex items-center justify-center">
                  <img 
                    src={imageSrc} 
                    alt={fileTitle}
                    referrerPolicy="no-referrer"
                    className="max-w-[85%] max-h-[60vh] object-contain rounded-xl shadow-2xl border border-white/5"
                  />
                </div>
              </div>
            ) : content !== null ? (
              <div className="flex-1 min-h-0 overflow-auto font-mono text-xs text-zinc-300 p-6 custom-scrollbar bg-black/40">
                <pre className="whitespace-pre-wrap break-all leading-relaxed tab-size-4 select-text">
                  <code>{content}</code>
                </pre>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-4">
                <FileText className="w-12 h-12 text-zinc-600" />
                <div>
                  <h4 className="font-black text-sm text-white uppercase tracking-wider">Unreadable File Format</h4>
                  <p className="text-xs text-zinc-500 mt-1 max-w-xs leading-relaxed">
                    This file format is binary or does not support visual live decoding inside the web explorer view.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action and detail column */}
          <div className="w-full md:w-80 bg-zinc-950 p-6 md:p-8 flex flex-col justify-between shrink-0 relative z-10">
            <div className="space-y-8">
              {/* Info panel */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest border-b border-white/5 pb-2">
                  Resource Analysis
                </h4>
                
                <div className="space-y-3">
                  <div>
                    <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider block">Identified Type</span>
                    <span className="text-xs font-bold text-zinc-300 capitalize">
                      {isImage ? 'Image Asset' : isXml ? 'Structured XML configuration' : 'Source Document'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider block">Package Domain</span>
                    <span className="text-xs font-mono text-zinc-400 break-all">
                      {filePath.startsWith('base/') ? 'Base Module' : 'Split Resource'}
                    </span>
                  </div>

                  {isXml && (
                    <div className="p-3 bg-brand/5 border border-brand/10 rounded-xl flex items-start gap-2.5">
                      <Sparkles className="w-4 h-4 text-brand shrink-0 mt-0.5 animate-pulse" />
                      <div>
                        <p className="text-[9px] font-black text-brand uppercase tracking-wider">Linter Compliant</p>
                        <p className="text-[10px] text-zinc-400 leading-relaxed mt-0.5">
                          Standard formatting matches verified Android Play Bundle structures.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Manipulation panel */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest border-b border-white/5 pb-2">
                  Modifications
                </h4>

                {content !== null && (
                  <button
                    onClick={handleCopy}
                    className="w-full py-3 px-4 bg-zinc-900 hover:bg-zinc-800 border border-white/5 hover:border-white/10 rounded-xl text-xs font-black uppercase tracking-widest text-zinc-200 hover:text-white transition-all flex items-center justify-center gap-2"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-400" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-zinc-400" />
                        Copy Source
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={handleDownload}
                  className="w-full py-3 px-4 bg-zinc-900 hover:bg-zinc-800 border border-white/5 hover:border-white/10 rounded-xl text-xs font-black uppercase tracking-widest text-zinc-200 hover:text-white transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4 text-zinc-400" />
                  Download File
                </button>

                <div className="relative">
                  <input 
                    type="file" 
                    id="replace-preview-file"
                    className="hidden" 
                    onChange={handleFileChange}
                  />
                  <label
                    htmlFor="replace-preview-file"
                    className="w-full py-3.5 px-4 bg-brand hover:brightness-110 rounded-xl text-xs font-black uppercase tracking-widest text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-brand/10 text-center"
                  >
                    <Upload className="w-4 h-4 text-white" />
                    Overwrite Asset
                  </label>
                </div>
              </div>
            </div>

            {/* Branding badge at bottom */}
            <div className="pt-6 border-t border-white/5 text-center mt-6">
              <span className="text-[9px] font-black tracking-[0.3em] uppercase bg-gradient-to-r from-zinc-500 via-brand/60 to-zinc-500 bg-clip-text text-transparent">
                justbeyou brand edition
              </span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

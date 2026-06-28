import React, { useState, useRef } from 'react';
import { 
  ShieldCheck, 
  Settings, 
  AlertCircle, 
  Loader2, 
  Save 
} from 'lucide-react';
import { cn } from '../lib/utils';

interface BundleFile {
  name: string;
  size: number;
  isDirectory: boolean;
}

export function ApkSigner({ 
  bundleId, 
  onSignSuccess 
}: { 
  bundleId: string;
  onSignSuccess: (files: BundleFile[], message: string, changes: string[]) => void;
}) {
  const [mode, setMode] = useState<'debug' | 'release'>('debug');
  const [keystoreFile, setKeystoreFile] = useState<File | null>(null);
  const [keystorePassword, setKeystorePassword] = useState('');
  const [keyAlias, setKeyAlias] = useState('');
  const [keyPassword, setKeyPassword] = useState('');
  const [algorithm, setAlgorithm] = useState<'SHA-256' | 'SHA-1'>('SHA-256');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' | null }>({ message: '', type: null });
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setStatus({ message: '', type: null });

    const formData = new FormData();
    formData.append('bundleId', bundleId);
    formData.append('mode', mode);
    formData.append('algorithm', algorithm);
    
    if (mode === 'release') {
      if (!keystoreFile) {
        setStatus({ message: 'Keystore file is required for release signing', type: 'error' });
        setIsLoading(false);
        return;
      }
      formData.append('keystore', keystoreFile);
      formData.append('keystorePassword', keystorePassword);
      formData.append('keyAlias', keyAlias);
      formData.append('keyPassword', keyPassword);
    }

    try {
      const res = await fetch('/api/sign', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to sign the file.');
      }

      setStatus({ message: data.message, type: 'success' });
      onSignSuccess(
        data.files, 
        `Signed (${mode})`, 
        [
          `Injected digital signature using ${mode} profile`,
          `Cryptographic Digest: ${algorithm}`,
          ...(mode === 'release' ? [`Key Alias: ${keyAlias}`] : [`Generated secure self-signed 2048-bit RSA key`])
        ]
      );
    } catch (err: any) {
      setStatus({ message: err.message, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-dark rounded-[2.5rem] p-10 border border-white/5 relative overflow-hidden shadow-2xl">
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-brand/5 rounded-full blur-3xl opacity-50 pointer-events-none" />
      
      <div className="flex items-center gap-6 mb-8 relative z-10">
        <div className="w-14 h-14 bg-brand/10 border border-brand/20 rounded-2xl flex items-center justify-center">
          <ShieldCheck className="w-7 h-7 text-brand" />
        </div>
        <div>
          <h4 className="font-black text-2xl text-white tracking-tighter uppercase">Signature Provisioner</h4>
          <p className="text-zinc-500 font-bold uppercase tracking-widest text-[10px] mt-1">
            Cryptographic Signing & Integrity Verification
          </p>
        </div>
      </div>

      <form onSubmit={handleSign} className="space-y-6 relative z-10">
        {/* Mode Selector */}
        <div className="grid grid-cols-2 gap-4 p-1.5 bg-zinc-950/60 rounded-2xl border border-white/5">
          <button
            type="button"
            onClick={() => setMode('debug')}
            className={cn(
              "py-3.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
              mode === 'debug'
                ? "bg-brand text-white shadow-xl shadow-brand/20"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            Debug Mode
          </button>
          <button
            type="button"
            onClick={() => setMode('release')}
            className={cn(
              "py-3.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
              mode === 'release'
                ? "bg-brand text-white shadow-xl shadow-brand/20"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            Release Mode
          </button>
        </div>

        {mode === 'release' ? (
          <div className="space-y-5">
            {/* Keystore Upload */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block">
                Keystore File (PKCS#12)
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all bg-zinc-950/40",
                  keystoreFile
                    ? "border-emerald-500/30 hover:border-emerald-500/50"
                    : "border-white/5 hover:border-brand/30"
                )}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".keystore,.jks,.p12,.pfx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setKeystoreFile(file);
                  }}
                />
                {keystoreFile ? (
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-emerald-400 truncate">{keystoreFile.name}</p>
                    <p className="text-[10px] text-zinc-500 uppercase font-mono">{(keystoreFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div className="space-y-1 bg-zinc-950/20 p-4 rounded-xl">
                    <p className="text-xs font-black text-zinc-400 uppercase tracking-widest">Select Keystore File</p>
                    <p className="text-[9px] text-zinc-600 uppercase tracking-wider mt-1">Supports PKCS#12 format (.p12, .keystore, .jks)</p>
                  </div>
                )}
              </div>
            </div>

            {/* Password Credentials */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block">
                  Keystore Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full bg-zinc-950/40 border border-white/5 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-brand/50 transition-all font-mono"
                  value={keystorePassword}
                  onChange={(e) => setKeystorePassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block">
                  Key Alias
                </label>
                <input
                  type="text"
                  placeholder="key0"
                  className="w-full bg-zinc-950/40 border border-white/5 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-brand/50 transition-all"
                  value={keyAlias}
                  onChange={(e) => setKeyAlias(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block">
                Key Password (If different from keystore)
              </label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full bg-zinc-950/40 border border-white/5 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-brand/50 transition-all font-mono"
                value={keyPassword}
                onChange={(e) => setKeyPassword(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="p-6 bg-brand/5 rounded-2xl border border-brand/10 text-zinc-400 text-xs leading-relaxed space-y-2">
            <p className="font-bold text-brand uppercase tracking-wider text-[10px]">Auto-Provisioned Debug Signing</p>
            <p>
              In Debug mode, the Signature Provisioner generates a secure, self-signed 2048-bit RSA keypair and certificate on the fly. No manual keystore uploading is required.
            </p>
          </div>
        )}

        {/* Toggleable Advanced Options */}
        <div className="border-t border-white/5 pt-4">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-[10px] font-black text-zinc-500 uppercase tracking-widest hover:text-zinc-300 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            {showAdvanced ? 'Hide Cryptographic Options' : 'Show Cryptographic Options'}
          </button>

          {showAdvanced && (
            <div className="mt-4 p-4 bg-zinc-950/40 rounded-xl border border-white/5 space-y-3">
              <label className="text-[9px] font-black text-zinc-500 uppercase tracking-wider block">
                Digest Algorithm
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-xs font-bold text-zinc-400 cursor-pointer">
                  <input
                    type="radio"
                    name="algorithm"
                    checked={algorithm === 'SHA-256'}
                    onChange={() => setAlgorithm('SHA-256')}
                    className="accent-brand"
                  />
                  SHA-256 (Modern)
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-zinc-400 cursor-pointer">
                  <input
                    type="radio"
                    name="algorithm"
                    checked={algorithm === 'SHA-1'}
                    onChange={() => setAlgorithm('SHA-1')}
                    className="accent-brand"
                  />
                  SHA-1 (Legacy/V1)
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Status / Log display */}
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
              <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            )}
            <div>
              <p className="uppercase tracking-wider text-[10px] font-black mb-1">
                {status.type === 'success' ? 'Signature Provision Successful' : 'Signature Error'}
              </p>
              <p className="opacity-90 leading-relaxed font-mono text-[11px]">{status.message}</p>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className={cn(
            "w-full py-4 rounded-2xl font-black uppercase text-xs tracking-widest text-white transition-all active:scale-95 flex items-center justify-center gap-2 shadow-2xl",
            isLoading
              ? "bg-zinc-800 text-zinc-600 border border-white/5 cursor-not-allowed"
              : "bg-brand hover:brightness-110 shadow-brand/20"
          )}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              Signing Package...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 text-white" />
              Inject Digital Signature
            </>
          )}
        </button>
      </form>
    </div>
  );
}

import React, { useCallback, useRef, useState } from 'react';
import { ImagePlus, Loader2, RefreshCw, X } from 'lucide-react';

/**
 * Custom cover-image upload: drag & drop, click to browse, or paste an
 * image (Ctrl/⌘+V) while the zone is focused. Accepts images up to 50MB.
 *
 * The uploaded file is resized client-side (max 1920px on the long edge,
 * JPEG quality 0.85, PNG kept as PNG) and handed back as a data URL, so a
 * 50MB original never lands in the event record, localStorage, or the
 * shared API payload — those would break on a multi-megabyte string.
 */

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_DIMENSION = 1920;

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('unreadable'));
    img.src = src;
  });
}

async function compressToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(img, 0, 0, width, height);
    const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, 0.85),
    );
    if (!blob) throw new Error('encode');
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('read'));
      reader.readAsDataURL(blob);
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

interface ImageUploadFieldProps {
  uploadedImage: string | null;
  onUpload: (dataUrl: string) => void;
  onRemove: () => void;
}

export function ImageUploadField({
  uploadedImage,
  onUpload,
  onRemove,
}: ImageUploadFieldProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [fileMeta, setFileMeta] = useState<{ name: string; size: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const processFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      setError('');
      if (!file.type.startsWith('image/')) {
        setError('That file is not an image. Please drop an image file.');
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(
          `This image is ${formatFileSize(file.size)} — the limit is 50MB.`,
        );
        return;
      }
      setIsProcessing(true);
      try {
        const dataUrl = await compressToDataUrl(file);
        setFileMeta({ name: file.name, size: file.size });
        onUpload(dataUrl);
      } catch {
        setError("Couldn't read that image. Please try another file.");
      } finally {
        setIsProcessing(false);
      }
    },
    [onUpload],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        e.preventDefault();
        void processFile(files[0]);
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          void processFile(item.getAsFile());
          return;
        }
      }
    },
    [processFile],
  );

  const openPicker = () => inputRef.current?.click();

  // Uploaded preview — eases in softly on mount (see keyframes below).
  if (uploadedImage) {
    return (
      <div>
        <style>{`
          @keyframes upload-preview-in {
            from { opacity: 0; transform: translateY(14px) scale(0.965); filter: blur(6px); }
            to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
          }
          @keyframes upload-bar-in {
            from { opacity: 0; transform: translateY(100%); }
            to { opacity: 1; transform: translateY(0); }
          }
          .upload-preview-in { animation: upload-preview-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) both; }
          .upload-bar-in { animation: upload-bar-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) 0.15s both; }
          @media (prefers-reduced-motion: reduce) {
            .upload-preview-in, .upload-bar-in { animation: none; }
          }
        `}</style>
        <div className="upload-preview-in relative rounded-xl overflow-hidden border-2 border-[#1E3F35] ring-2 ring-[#D0E2D9] shadow-md">
          <img
            src={uploadedImage}
            alt="Uploaded cover preview"
            className="w-full aspect-[16/9] object-cover"
          />
          <div className="upload-bar-in absolute bottom-0 inset-x-0 bg-[#1E2320]/80 px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-white truncate">
              {fileMeta ? `${fileMeta.name} · ${formatFileSize(fileMeta.size)}` : 'Your uploaded image'}
            </span>
            <span className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={openPicker}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/15 hover:bg-white/30 text-white text-[11px] font-medium transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Replace
              </button>
              <button
                type="button"
                onClick={() => {
                  setFileMeta(null);
                  onRemove();
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/15 hover:bg-white/30 text-white text-[11px] font-medium transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" />
                Remove
              </button>
            </span>
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label="Replace uploaded cover image"
          onChange={(e) => {
            void processFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <style>{`
        @keyframes upload-idle-glow {
          0%, 100% { box-shadow: 0 0 0 rgba(30, 63, 53, 0); }
          50% { box-shadow: 0 10px 30px rgba(30, 63, 53, 0.08); }
        }
        @keyframes upload-drag-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(30, 63, 53, 0.18); }
          50% { box-shadow: 0 0 0 10px rgba(30, 63, 53, 0); }
        }
        @keyframes upload-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes upload-progress {
          from { transform: translateX(-100%); }
          to { transform: translateX(320%); }
        }
        /* Marching dashes: the SVG rect's dash pattern circulates around
           the zone (top edge travels left to right). Paused by default —
           it only runs on hover or while an image is dragged over. */
        @keyframes upload-march {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -24; }
        }
        .upload-march { animation: upload-march 0.9s linear infinite; animation-play-state: paused; }
        .group:hover .upload-march, .upload-march-running { animation-play-state: running; }
        .upload-idle-glow { animation: upload-idle-glow 4.5s ease-in-out infinite; }
        .upload-drag-pulse { animation: upload-drag-pulse 1.4s ease-out infinite; }
        .upload-float { animation: upload-float 3.5s ease-in-out infinite; }
        .upload-progress { animation: upload-progress 1.2s cubic-bezier(0.45, 0, 0.55, 1) infinite; }
        @media (prefers-reduced-motion: reduce) {
          .upload-idle-glow, .upload-drag-pulse, .upload-float, .upload-progress, .upload-march { animation: none; }
        }
      `}</style>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Upload a cover image"
        onChange={(e) => {
          void processFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a cover image: click to browse, drag and drop, or paste an image"
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
          }
        }}
        onPaste={handlePaste}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          setIsDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setIsDragging(false);
          void processFile(e.dataTransfer.files?.[0]);
        }}
        className={`group relative rounded-xl border-2 border-transparent px-4 py-8 text-center cursor-pointer overflow-hidden outline-none transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:ring-2 focus-visible:ring-[#1E3F35] focus-visible:ring-offset-2 ${
          isDragging
            ? 'upload-drag-pulse bg-[#EAF2EC] shadow-lg shadow-[#1E3F35]/10 scale-[1.015]'
            : isProcessing
              ? 'bg-[#EFF5F0]'
              : 'upload-idle-glow bg-[#F7F4EF] hover:bg-[#EFF5F0] hover:shadow-xl hover:shadow-[#1E3F35]/10 hover:-translate-y-0.5'
        }`}
      >
        {/* Animated dashed border (replaces the static CSS dashes, which
            cannot move). The rect's dashes march around the zone — left to
            right along the top — on hover and while dragging an image. */}
        <svg
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 h-full w-full transition-colors duration-300 ${
            isDragging
              ? 'text-[#1E3F35]'
              : 'text-[#C8C4BC] group-hover:text-[#1E3F35]'
          }`}
        >
          <rect
            x="1"
            y="1"
            rx="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="14 10"
            className={`upload-march ${isDragging ? 'upload-march-running' : ''}`}
            style={{ width: 'calc(100% - 2px)', height: 'calc(100% - 2px)' }}
          />
        </svg>
        {/* Shine sweep on hover — glides across the zone, never blocks clicks. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out bg-gradient-to-r from-transparent via-white/50 to-transparent"
        />
        <div className="relative">
          <div
            className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isDragging
                ? 'bg-[#1E3F35] text-white scale-110'
                : isProcessing
                  ? 'bg-[#D0E2D9] text-[#1E3F35]'
                  : 'upload-float bg-[#D0E2D9] text-[#1E3F35] group-hover:scale-110 group-hover:bg-[#1E3F35] group-hover:text-white'
            }`}
          >
            {isProcessing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ImagePlus className="w-5 h-5" />
            )}
          </div>
          <p className="mt-3 text-sm font-semibold text-[#1E2320] transition-colors duration-300">
            {isProcessing
              ? 'Preparing your image…'
              : isDragging
                ? 'Drop it here'
                : 'Drop your image here'}
          </p>
          <p className="mt-1 text-[11px] text-[#5F635D] leading-relaxed">
            or click to browse · or paste an image here (Ctrl+V) · up to 50MB
            <br />
            <span className="text-[#8C887E]">
              Images are resized for fast loading before they are saved.
            </span>
          </p>
        </div>
        {/* Elegant indeterminate progress line while the image is prepared. */}
        {isProcessing && (
          <span className="absolute bottom-0 left-0 right-0 h-[3px] overflow-hidden bg-[#D0E2D9]">
            <span className="upload-progress absolute top-0 bottom-0 w-1/3 bg-gradient-to-r from-transparent via-[#1E3F35] to-transparent" />
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-[11px] text-rose-600 mt-1.5">
          {error}
        </p>
      )}
    </div>
  );
}

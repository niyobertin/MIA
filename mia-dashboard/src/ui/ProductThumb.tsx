import { useState } from 'react';
import { ImageIcon } from 'lucide-react';

const TONES = [
  'bg-emerald-50 text-emerald-600',
  'bg-sky-50 text-sky-600',
  'bg-amber-50 text-amber-600',
  'bg-violet-50 text-violet-600',
  'bg-rose-50 text-rose-600',
  'bg-teal-50 text-teal-600',
];

function toneFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return TONES[Math.abs(hash) % TONES.length];
}

/** Product picture, or a soft coloured placeholder until a photo is added. */
export function ProductThumb({ name, src, className = '', iconSize = 28 }: { name: string; src?: string | null; className?: string; iconSize?: number }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  return (
    <div className={`relative flex items-center justify-center overflow-hidden ${showImage ? 'bg-slate-100' : toneFor(name)} ${className}`}>
      {showImage ? (
        <img src={src as string} alt={name} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <ImageIcon size={iconSize} strokeWidth={1.6} aria-hidden className="opacity-80" />
      )}
    </div>
  );
}

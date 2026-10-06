'use client';

import { useState } from 'react';

// 실패한 이미지 대신 이름을 보여 주고 원래 크기를 유지한다.
export function VisualImage({ src, alt = '', fallback = '', width = 32, height = 32, className = '' }: { src?: string | null; alt?: string; fallback?: string; width?: number; height?: number; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <span className={`visual-image ${className}`} style={{ width, height }} aria-hidden={alt ? undefined : true}>
      {src && src !== failedSrc ? <img src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async" onError={() => setFailedSrc(src)} /> : <span className="visual-fallback" aria-label={alt || undefined}>{fallback}</span>}
    </span>
  );
}

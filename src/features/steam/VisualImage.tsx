'use client';

import { useState } from 'react';

// 실패한 이미지 대신 이름을 보여 주고 원래 크기를 유지한다.
export function VisualImage({ src, alt = '', fallback = '', width = 32, height = 32, className = '' }: { src?: string | null; alt?: string; fallback?: string; width?: number; height?: number; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <span className={`visual-image ${className}`} style={{ width, height }} aria-hidden={alt ? undefined : true}>
      {src && src !== failedSrc ? <img ref={node => {
        if (node?.complete && node.naturalWidth === 0) setFailedSrc(src);
      }} src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async" onError={() => setFailedSrc(src)} /> : <span className="visual-fallback" aria-label={alt || undefined}>{fallback}</span>}
    </span>
  );
}

export function ServiceMark({ service, size = 32 }: { service: 'steam' | 'leagueoflegends' | 'discord'; size?: number }) {
  return <VisualImage src={`/brands/${service}.svg`} width={size} height={size} className="service-mark" />;
}

export function UiIcon({ name, size = 18 }: { name: 'search' | 'arrow-right' | 'controller' | 'people' | 'star' | 'house-door' | 'gear' | 'box-arrow-up-right'; size?: number }) {
  return <VisualImage src={`/ui/${name}.svg`} width={size} height={size} className="ui-icon" />;
}

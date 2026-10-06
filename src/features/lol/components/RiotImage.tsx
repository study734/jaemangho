'use client';

import { useState, type ImgHTMLAttributes } from 'react';
import { riotImageUrl, RIOT_IMAGE_PLACEHOLDER, type RiotImageKind } from '../domain/images';

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError' | 'alt'> & { alt: string };
type RiotImageProps = ImageProps & { kind: RiotImageKind; asset: string | number };

// 이미지가 바뀌면 key로 실패 상태를 초기화한다. 대체 이미지 실패는 재시도하지 않는다.
export function RiotImage({ kind, asset, ...props }: RiotImageProps) {
  const src = riotImageUrl(kind, asset);
  return <AssetImage key={src} src={src} {...props} />;
}

function AssetImage({ src, alt, style, title, ...props }: ImageProps & { src: string }) {
  const [failed, setFailed] = useState(false);
  const unavailable = failed || src === RIOT_IMAGE_PLACEHOLDER;
  return (
    <img
      {...props}
      src={unavailable ? RIOT_IMAGE_PLACEHOLDER : src}
      alt={unavailable ? `${alt} (이미지 없음)` : alt}
      title={unavailable ? `${alt}: 이미지 없음` : title ?? alt}
      decoding="async"
      style={{ objectFit: 'cover', flexShrink: 0, ...style }}
      onError={unavailable ? undefined : () => setFailed(true)}
    />
  );
}

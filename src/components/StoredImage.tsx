import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { isStoredImageRef, resolveImageSrc } from '../services/questionService';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string };

/**
 * An <img> for question image fields, which hold either a plain URL or a
 * `qimg:` reference to an image stored in Firestore (see questionService).
 * Admin-only: contestants get already-resolved images via the live projection.
 */
export function StoredImage({ src, alt = '', ...rest }: Props) {
  // What `src` resolved to; null data means the stored image no longer exists.
  const [result, setResult] = useState<{ src: string; data: string | null } | null>(null);
  const stored = isStoredImageRef(src);

  useEffect(() => {
    if (!stored) return;
    let cancelled = false;
    resolveImageSrc(src)
      .then((data) => !cancelled && setResult({ src, data }))
      .catch(() => !cancelled && setResult({ src, data: null }));
    return () => {
      cancelled = true;
    };
  }, [src, stored]);

  if (!stored) return <img src={src} alt={alt} {...rest} />;
  if (result?.src !== src) return <span className="muted">Loading image...</span>;
  if (!result.data) return <span className="muted">Image unavailable</span>;
  return <img src={result.data} alt={alt} {...rest} />;
}

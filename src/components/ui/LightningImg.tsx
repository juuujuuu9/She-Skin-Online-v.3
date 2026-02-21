import { useState, useEffect, useRef } from 'react';

interface ImageVariant {
  url: string;
  width: number;
}

interface LightningImgProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
  sizes?: string;
  dominantColor?: string;
  /** When provided (e.g. from collaborations), use these URLs for srcset instead of query params */
  variants?: { sm?: ImageVariant; md?: ImageVariant; lg?: ImageVariant };
  /** Use image's natural aspect ratio (no crop); when true, container grows to image height */
  naturalAspect?: boolean;
}

/**
 * Lightning-fast image component with blurhash placeholder and lazy loading
 */
export function LightningImg({
  src,
  alt,
  width,
  height,
  className = '',
  priority = false,
  sizes = '100vw',
  dominantColor = '#f0f0f0',
  variants,
  naturalAspect = false,
}: LightningImgProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Check if image is already cached
  useEffect(() => {
    if (imgRef.current?.complete) {
      setLoaded(true);
    }
  }, []);

  const isWordPress = src.includes('sheskin.org/wp-content');

  // Determine optimized source and srcset
  const { optimizedSrc, srcset } = (() => {
    // Pre-built variants (e.g. collaborations): use exact URLs, no query params
    if (variants && (variants.sm?.url || variants.md?.url || variants.lg?.url)) {
      const parts: string[] = [];
      if (variants.sm?.url) parts.push(`${variants.sm.url} ${variants.sm.width}w`);
      if (variants.md?.url) parts.push(`${variants.md.url} ${variants.md.width}w`);
      if (variants.lg?.url) parts.push(`${variants.lg.url} ${variants.lg.width}w`);
      return {
        optimizedSrc: variants.md?.url || variants.lg?.url || variants.sm?.url || src,
        srcset: parts.length > 0 ? parts.join(', ') : undefined,
      };
    }

    if (src.includes('b-cdn.net') || src.includes('bunnycdn')) {
      const widths = [320, 640, 960, 1280, 1920];
      const srcset = widths
        .map(w => `${src}?width=${w}&quality=85&format=webp ${w}w`)
        .join(', ');
      return { optimizedSrc: src, srcset };
    }

    if (isWordPress) {
      const cleanSrc = src.replace(/-\d+x\d+(?=\.[a-z]+$)/, '');
      return { optimizedSrc: cleanSrc, srcset: undefined };
    }

    return { optimizedSrc: src, srcset: undefined };
  })();

  const useNaturalAspect = naturalAspect || (!width && !height);

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        backgroundColor: dominantColor,
        aspectRatio: useNaturalAspect ? 'auto' : width && height ? `${width}/${height}` : 'auto',
        // Reserve space when natural aspect and no dimensions (e.g. collaborations) so box is visible before image loads
        ...(useNaturalAspect && !width && !height ? { minHeight: 200 } : {}),
      }}
    >
      {/* Skeleton/placeholder shimmer */}
      {!loaded && !error && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{
            background: `linear-gradient(90deg, ${dominantColor} 0%, rgba(255,255,255,0.3) 50%, ${dominantColor} 100%)`,
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
          }}
        />
      )}

      {/* Broken image placeholder */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-100">
          <svg className="w-10 h-10 mb-1 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xs">Image unavailable</span>
        </div>
      )}

      {/* Actual image */}
      {!error && (
        <img
          ref={imgRef}
          src={optimizedSrc}
          alt={alt}
          width={width}
          height={height}
          srcSet={srcset}
          sizes={sizes}
          loading={priority ? 'eager' : 'lazy'}
          decoding={priority ? 'sync' : 'async'}
          fetchPriority={priority ? 'high' : 'auto'}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`w-full transition-opacity duration-300 ${
            useNaturalAspect ? 'h-auto object-contain' : 'h-full object-cover'
          } ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}

      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </div>
  );
}

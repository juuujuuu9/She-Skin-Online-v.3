/**
 * MediaSelector Component
 * 
 * A tabbed interface for selecting media:
 * - Gallery tab: Browse existing media from database
 * - Upload tab: FilePond drag/drop or browse for new files
 * 
 * Used by Works and Audio admin pages.
 */

import { useState, useCallback, useEffect } from 'react';
import type { Media } from '@lib/db/schema';
import { FilePondUploader, type UploadedFile } from './FilePondUploader';

interface MediaSelectorProps {
  mediaType?: 'image' | 'audio' | 'video' | 'all';
  onSelect: ((media: Media) => void) | string;
  onCancel?: () => void;
  selectedId?: string;
}

type Tab = 'gallery' | 'upload';

export default function MediaSelector({
  mediaType = 'all',
  onSelect,
  onCancel,
  selectedId,
}: MediaSelectorProps) {
  const [activeTab, setActiveTab] = useState<Tab>('gallery');
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Resolve onSelect handler (supports function or global function name string)
  const resolveOnSelect = useCallback((media: Media) => {
    if (typeof onSelect === 'string') {
      const globalHandler = (window as unknown as Record<string, (media: Media) => void>)[onSelect];
      if (typeof globalHandler === 'function') {
        globalHandler(media);
      }
    } else if (typeof onSelect === 'function') {
      onSelect(media);
    }
  }, [onSelect]);

  // Resolve onCancel handler (supports function or global function name string)
  const resolveOnCancel = useCallback(() => {
    if (typeof onCancel === 'string') {
      const globalHandler = (window as unknown as Record<string, () => void>)[onCancel];
      if (typeof globalHandler === 'function') {
        globalHandler();
      }
    } else if (typeof onCancel === 'function') {
      onCancel();
    }
  }, [onCancel]);

  // Get CSRF token from cookie (decodeURIComponent needed as cookie values are URL-encoded)
  const getCsrfToken = () => {
    const match = document.cookie.match(/csrf_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  };

  // Fetch media list
  const fetchMedia = useCallback(async () => {
    setLoading(true);
    try {
      const typeParam = mediaType !== 'all' ? `&type=${mediaType}` : '';
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
      const response = await fetch(`/api/admin/media?limit=50${typeParam}${searchParam}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setMedia(data.media || []);
      } else {
        setError('Failed to load media');
      }
    } catch (err) {
      setError('Failed to load media');
    } finally {
      setLoading(false);
    }
  }, [mediaType, search]);

  // Load media on mount and when search changes
  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  // Handle FilePond upload complete
  const handleFilePondUpload = (uploadedFiles: UploadedFile[]) => {
    if (uploadedFiles.length > 0) {
      const file = uploadedFiles[0];
      // Refresh gallery and show success
      fetchMedia();
      setError(null);
      setSuccess(`"${file.name}" uploaded successfully. Click it to select.`);
      setActiveTab('gallery');
    }
  };

  // Get accepted file types based on mediaType filter
  const getAcceptedTypes = () => {
    switch (mediaType) {
      case 'image':
        return ['image/*'];
      case 'audio':
        return ['audio/*'];
      case 'video':
        return ['video/*'];
      case 'all':
      default:
        return ['image/*', 'audio/*', 'video/*'];
    }
  };

  // Get media type label
  const getMediaTypeLabel = (type: string) => {
    switch (type) {
      case 'image': return 'Image';
      case 'audio': return 'Audio';
      case 'video': return 'Video';
      default: return 'File';
    }
  };

  // Get thumbnail for media
  const getThumbnail = (mediaItem: Media) => {
    if (mediaItem.mediaType === 'image') {
      // Use smallest available variant for thumbnails
      return mediaItem.variants?.sm?.url || mediaItem.variants?.md?.url || mediaItem.url;
    }
    // Placeholder icons for audio/video with better visual distinction
    if (mediaItem.mediaType === 'audio') {
      return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%239b59b6'%3E%3Cpath d='M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'/%3E%3C/svg%3E";
    }
    if (mediaItem.mediaType === 'video') {
      return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23e74c3c'%3E%3Cpath d='M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z'/%3E%3C/svg%3E";
    }
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23666'%3E%3Cpath d='M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z'/%3E%3C/svg%3E";
  };

  return (
    <div className="media-selector" style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h3 style={styles.title}>Select Media</h3>
        {onCancel && (
          <button onClick={resolveOnCancel} style={styles.closeButton}>
            &times;
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          onClick={() => {
            setActiveTab('gallery');
            setSuccess(null);
          }}
          style={{
            ...styles.tab,
            ...(activeTab === 'gallery' ? styles.tabActive : {}),
          }}
        >
          Gallery
        </button>
        <button
          onClick={() => {
            setActiveTab('upload');
            setSuccess(null);
          }}
          style={{
            ...styles.tab,
            ...(activeTab === 'upload' ? styles.tabActive : {}),
          }}
        >
          Upload New
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div style={styles.error}>
          {error}
          <button onClick={() => setError(null)} style={styles.errorClose}>
            &times;
          </button>
        </div>
      )}

      {/* Success message */}
      {success && (
        <div style={styles.success}>
          {success}
          <button onClick={() => setSuccess(null)} style={styles.successClose}>
            &times;
          </button>
        </div>
      )}

      {/* Gallery Tab */}
      {activeTab === 'gallery' && (
        <div style={styles.galleryContainer}>
          {/* Search */}
          <input
            type="text"
            placeholder="Search media..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.searchInput}
          />

          {/* Media Grid */}
          {loading ? (
            <div style={styles.loading}>Loading...</div>
          ) : media.length === 0 ? (
            <div style={styles.empty}>
              No media found. Switch to "Upload New" to add files.
            </div>
          ) : (
            <div style={styles.grid}>
              {media.map((item) => (
                <div
                  key={item.id}
                  onClick={() => resolveOnSelect(item)}
                  style={{
                    ...styles.mediaItem,
                    ...(selectedId === item.id ? styles.mediaItemSelected : {}),
                  }}
                >
                  <div style={styles.thumbnailContainer}>
                    <img
                      src={getThumbnail(item)}
                      alt={item.altText || item.filename}
                      style={item.mediaType === 'image' ? styles.thumbnail : styles.thumbnailIcon}
                    />
                    <span style={styles.typeBadge}>
                      {getMediaTypeLabel(item.mediaType)}
                    </span>
                  </div>
                  <div style={styles.mediaInfo}>
                    <div style={styles.mediaName} title={item.filename}>
                      {item.filename}
                    </div>
                    <div style={styles.mediaMeta}>
                      {item.width && item.height
                        ? `${item.width}x${item.height} • `
                        : ''}
                      {(item.fileSize / 1024 / 1024).toFixed(2)} MB
                      {item.mediaType === 'image' && item.originalName !== item.filename && (
                        <span style={styles.originalName}> • was {item.originalName.replace(/\.[^.]+$/, '')}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upload Tab */}
      {activeTab === 'upload' && (
        <div style={styles.uploadContainer}>
          <FilePondUploader
            allowMultiple={false}
            acceptedFileTypes={getAcceptedTypes()}
            onUploadComplete={handleFilePondUpload}
            variant="dropzone"
            labelIdle='Drag & drop a file or <span class="filepond--label-action">Browse</span>'
          />

          <div style={styles.uploadInfo}>
            <p>Max file size: 500MB</p>
            <p>
              Allowed types: Images (JPG, PNG, WebP), Audio (MP3, WAV, FLAC),
              Video (MP4, WebM, MOV)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#1a1a1a',
    borderRadius: '8px',
    color: '#fff',
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #333',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#999',
    fontSize: '24px',
    cursor: 'pointer',
    padding: '0 4px',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid #333',
  },
  tab: {
    flex: 1,
    padding: '12px 20px',
    background: 'none',
    border: 'none',
    color: '#999',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
  tabActive: {
    color: '#fff',
    borderBottom: '2px solid #fff',
  },
  galleryContainer: {
    padding: '20px',
    overflow: 'auto',
  },
  searchInput: {
    width: '100%',
    padding: '10px 12px',
    background: '#2a2a2a',
    border: '1px solid #444',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
    marginBottom: '16px',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#999',
  },
  empty: {
    textAlign: 'center',
    padding: '40px',
    color: '#999',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: '12px',
  },
  mediaItem: {
    background: '#2a2a2a',
    borderRadius: '6px',
    overflow: 'hidden',
    cursor: 'pointer',
    border: '2px solid transparent',
    transition: 'border-color 0.2s',
  },
  mediaItemSelected: {
    borderColor: '#4a9eff',
  },
  thumbnailContainer: {
    position: 'relative',
    aspectRatio: '1',
    background: '#1a1a1a',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  thumbnailIcon: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    padding: '20%',
    boxSizing: 'border-box',
  },
  typeBadge: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    background: 'rgba(0,0,0,0.7)',
    color: '#fff',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    textTransform: 'uppercase',
  },
  mediaInfo: {
    padding: '8px',
  },
  mediaName: {
    fontSize: '12px',
    color: '#fff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginBottom: '4px',
  },
  mediaMeta: {
    fontSize: '10px',
    color: '#999',
  },
  originalName: {
    color: '#666',
    fontStyle: 'italic',
  },
  uploadContainer: {
    padding: '20px',
  },
  uploadInfo: {
    marginTop: '16px',
    fontSize: '12px',
    color: '#666',
    textAlign: 'center',
  },
  error: {
    background: '#ff444422',
    border: '1px solid #ff4444',
    color: '#ff6666',
    padding: '12px 16px',
    margin: '0 20px',
    borderRadius: '6px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorClose: {
    background: 'none',
    border: 'none',
    color: '#ff6666',
    fontSize: '18px',
    cursor: 'pointer',
  },
  success: {
    background: '#22c55e22',
    border: '1px solid #22c55e',
    color: '#4ade80',
    padding: '12px 16px',
    margin: '8px 20px 0 20px',
    borderRadius: '6px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  successClose: {
    background: 'none',
    border: 'none',
    color: '#4ade80',
    fontSize: '18px',
    cursor: 'pointer',
  },
};

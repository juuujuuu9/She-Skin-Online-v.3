/**
 * MediaSelector Component
 * 
 * A tabbed interface for selecting media:
 * - Gallery tab: Browse existing media from database
 * - Upload tab: Drag/drop or browse for new files
 * 
 * Used by Works and Audio admin pages.
 */

import { useState, useCallback, useEffect } from 'react';
import type { Media } from '@lib/db/schema';

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
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
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

  // Get CSRF token from cookie
  const getCsrfToken = () => {
    const match = document.cookie.match(/csrf_token=([^;]+)/);
    return match ? match[1] : '';
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

  // Handle file upload
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/admin/media', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-CSRF-Token': getCsrfToken(),
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.media) {
          // Refresh gallery, switch to it, and show success
          await fetchMedia();
          setError(null);
          setSuccess(`"${data.media.filename}" uploaded successfully. Click it to select.`);
          setActiveTab('gallery');
        } else {
          setSuccess(null);
          setError(data.error || 'Upload failed');
        }
      } else {
        const data = await response.json();
        setSuccess(null);
        setError(data.error || 'Upload failed');
      }
    } catch (err) {
      setError('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFileUpload(e.dataTransfer.files);
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
      return mediaItem.variants?.sm?.url || mediaItem.url;
    }
    // Placeholder icons for audio/video
    if (mediaItem.mediaType === 'audio') {
      return "data:image/svg+xml,%3Csvg fill='%23434343' viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M211.44824,52.50586l-80-24A12.00045,12.00045,0,0,0,116,40V87.73047q-.00587.27539,0,.54785V140.2168A51.97764,51.97764,0,1,0,140,184V104.12842l64.55176,19.36572A12.00045,12.00045,0,0,0,220,112V64A11.99994,11.99994,0,0,0,211.44824,52.50586ZM88,212a28,28,0,1,1,28-28A28.03146,28.03146,0,0,1,88,212ZM196,95.87158,140,79.07129V56.12842l56,16.80029Z'/%3E%3C/svg%3E";
    }
    if (mediaItem.mediaType === 'video') {
      return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23666"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>';
    }
    return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23666"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>';
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
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            style={styles.dropzone}
          >
            <input
              type="file"
              onChange={(e) => handleFileUpload(e.target.files)}
              accept={
                mediaType === 'image'
                  ? 'image/*'
                  : mediaType === 'audio'
                  ? 'audio/*'
                  : mediaType === 'video'
                  ? 'video/*'
                  : '*/*'
              }
              style={styles.fileInput}
              id="file-upload"
            />
            <label htmlFor="file-upload" style={styles.dropzoneLabel}>
              {uploading ? (
                <div style={styles.uploading}>
                  <div style={styles.spinner} />
                  <span>Uploading...</span>
                </div>
              ) : (
                <>
                  <div style={styles.uploadIcon}>+</div>
                  <div>Drag & drop a file here</div>
                  <div style={styles.orText}>or</div>
                  <div style={styles.browseButton}>Browse Files</div>
                </>
              )}
            </label>
          </div>

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
    width: '60%',
    height: '60%',
    objectFit: 'contain',
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
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
  dropzone: {
    border: '2px dashed #444',
    borderRadius: '8px',
    padding: '40px',
    textAlign: 'center',
    cursor: 'pointer',
  },
  fileInput: {
    display: 'none',
  },
  dropzoneLabel: {
    cursor: 'pointer',
    display: 'block',
  },
  uploadIcon: {
    fontSize: '48px',
    color: '#666',
    marginBottom: '12px',
  },
  orText: {
    color: '#666',
    margin: '8px 0',
  },
  browseButton: {
    display: 'inline-block',
    padding: '8px 16px',
    background: '#333',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
  },
  uploading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #333',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
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

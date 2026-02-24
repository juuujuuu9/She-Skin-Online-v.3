/**
 * MediaManager Component
 * 
 * Full media library management for the /admin/uploads page.
 * Features:
 * - Grid view of all media
 * - Upload new files (via FilePond)
 * - Delete items (with ref count warning)
 * - Search/filter
 * - Show reference counts
 */

import { useState, useCallback, useEffect } from 'react';
import type { Media } from '@lib/db/schema';
import { FilePondUploader, useFilePondUpload, type UploadedFile } from './FilePondUploader';

interface MediaManagerProps {
  initialMedia?: Media[];
}

type ViewMode = 'grid' | 'list';

export default function MediaManager({ initialMedia = [] }: MediaManagerProps) {
  const [media, setMedia] = useState<Media[]>(initialMedia);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  // FilePond upload state
  const {
    uploadedFiles: newUploadedFiles,
    isUploading,
    reset: resetUpload,
    handleUploadComplete,
  } = useFilePondUpload();
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Media | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const limit = 50;

  // Get CSRF token from cookie (decodeURIComponent needed as cookie values are URL-encoded)
  const getCsrfToken = () => {
    const match = document.cookie.match(/csrf_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  };

  // Fetch media list
  const fetchMedia = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const newOffset = reset ? 0 : offset;
      const typeParam = typeFilter !== 'all' ? `&type=${typeFilter}` : '';
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
      const response = await fetch(
        `/api/admin/media?limit=${limit}&offset=${newOffset}${typeParam}${searchParam}`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const data = await response.json();
        if (reset) {
          setMedia(data.media || []);
        } else {
          setMedia((prev) => [...prev, ...(data.media || [])]);
        }
        setTotal(data.pagination?.total || 0);
        setHasMore(data.pagination?.hasMore || false);
        if (reset) setOffset(limit);
        else setOffset((prev) => prev + limit);
      } else {
        setError('Failed to load media');
      }
    } catch (err) {
      setError('Failed to load media');
    } finally {
      setLoading(false);
    }
  }, [offset, search, typeFilter]);

  // Load media on mount
  useEffect(() => {
    fetchMedia(true);
  }, []);

  // Reload when search or filter changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setOffset(0);
      fetchMedia(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, typeFilter]);

  // Handle FilePond upload complete
  const handlePondUploadComplete = (uploadedFiles: UploadedFile[]) => {
    handleUploadComplete(uploadedFiles);
    
    // Convert to Media format and add to list
    const uploadedMedia: Media[] = uploadedFiles.map(f => ({
      id: f.id,
      filename: f.name,
      originalName: f.name,
      fileSize: f.size,
      mediaType: f.mediaType,
      url: f.url,
      variants: f.variants,
      width: f.width || null,
      height: f.height || null,
      blurhash: f.blurhash || null,
      refCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Media));

    if (uploadedMedia.length > 0) {
      setMedia((prev) => [...uploadedMedia, ...prev]);
      setTotal((prev) => prev + uploadedMedia.length);
      setError(null);
    }

    // Reset after a delay
    setTimeout(() => {
      resetUpload();
    }, 1000);
  };

  // Handle delete
  const handleDelete = async (mediaItem: Media, force = false) => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/media/${mediaItem.id}?force=${force}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'X-CSRF-Token': getCsrfToken(),
        },
      });

      if (response.ok) {
        setMedia((prev) => prev.filter((m) => m.id !== mediaItem.id));
        setDeleteConfirm(null);
        setTotal((prev) => prev - 1);
      } else if (response.status === 409) {
        // Media is in use, show confirmation
        const data = await response.json();
        setDeleteConfirm({ ...mediaItem, refCount: data.refCount });
      } else {
        const data = await response.json();
        setError(data.error || 'Delete failed');
      }
    } catch (err) {
      setError('Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  // Handle selection toggle
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Select all visible items
  const selectAll = () => {
    if (selectedIds.size === media.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(media.map((m) => m.id)));
    }
  };

  // Get selected media items
  const getSelectedItems = () => media.filter((m) => selectedIds.has(m.id));

  // Handle bulk delete using bulk API
  const handleBulkDelete = async (force = false) => {
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);

    try {
      const response = await fetch('/api/admin/media/bulk-delete', {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        body: JSON.stringify({ ids, force }),
      });

      const result = await response.json();
      const deletedCount = result.results?.deleted?.length || 0;
      const inUseCount = result.results?.inUse?.length || 0;

      // Update state - remove deleted items
      const deletedIds = new Set(result.results?.deleted || []);
      setMedia((prev) => prev.filter((m) => !deletedIds.has(m.id)));
      setTotal((prev) => prev - deletedCount);
      setSelectedIds(new Set());

      if (inUseCount > 0 && !force) {
        setError(`${inUseCount} item(s) are in use and were not deleted. Click "Force Delete All" to delete anyway.`);
      } else if (deletedCount > 0) {
        setError(null);
      }
    } catch {
      setError('Bulk delete failed');
    } finally {
      setBulkDeleting(false);
      setBulkDeleteConfirm(false);
    }
  };

  // Get media type label
  const getMediaTypeLabel = (type: string) => {
    switch (type) {
      case 'image':
        return 'Image';
      case 'audio':
        return 'Audio';
      case 'video':
        return 'Video';
      default:
        return 'File';
    }
  };

  // Get thumbnail for media
  const getThumbnail = (mediaItem: Media) => {
    if (mediaItem.mediaType === 'image') {
      // Use smallest available variant for thumbnails, fallback to full URL
      return mediaItem.variants?.sm?.url || mediaItem.variants?.md?.url || mediaItem.url;
    }
    if (mediaItem.mediaType === 'audio') {
      // Purple audio icon
      return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%239b59b6'%3E%3Cpath d='M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'/%3E%3C/svg%3E";
    }
    if (mediaItem.mediaType === 'video') {
      // Red video icon
      return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23e74c3c'%3E%3Cpath d='M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z'/%3E%3C/svg%3E";
    }
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23666'%3E%3Cpath d='M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z'/%3E%3C/svg%3E";
  };

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  // Format date
  const formatDate = (date: Date | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString();
  };

  return (
    <div style={styles.container}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.selectAllSection}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={selectedIds.size > 0 && selectedIds.size === media.length}
              onChange={selectAll}
              style={styles.checkbox}
            />
            <span style={styles.selectAllText}>
              {selectedIds.size === 0
                ? 'Select All'
                : selectedIds.size === media.length
                ? 'Deselect All'
                : `Select All (${selectedIds.size} selected)`}
            </span>
          </label>
        </div>

        <input
          type="text"
          placeholder="Search media..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={styles.searchInput}
        />

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={styles.filterSelect}
        >
          <option value="all">All Types</option>
          <option value="image">Images</option>
          <option value="audio">Audio</option>
          <option value="video">Video</option>
        </select>

        <div style={styles.viewToggle}>
          <button
            onClick={() => setViewMode('grid')}
            style={{
              ...styles.viewButton,
              ...(viewMode === 'grid' ? styles.viewButtonActive : {}),
            }}
          >
            Grid
          </button>
          <button
            onClick={() => setViewMode('list')}
            style={{
              ...styles.viewButton,
              ...(viewMode === 'list' ? styles.viewButtonActive : {}),
            }}
          >
            List
          </button>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div style={styles.bulkActionsBar}>
          <span style={styles.bulkActionsText}>
            {selectedIds.size} item{selectedIds.size === 1 ? '' : 's'} selected
          </span>
          <div style={styles.bulkActionsButtons}>
            <button
              onClick={() => setSelectedIds(new Set())}
              style={styles.bulkCancelButton}
            >
              Cancel
            </button>
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              style={styles.bulkDeleteButton}
            >
              Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div style={styles.error}>
          {error}
          <button onClick={() => setError(null)} style={styles.errorClose}>
            &times;
          </button>
        </div>
      )}

      {/* FilePond Upload Area */}
      <div style={styles.filepondContainer}>
        <FilePondUploader
          allowMultiple={true}
          maxFiles={50}
          onUploadComplete={handlePondUploadComplete}
          variant="dropzone"
          labelIdle='Drag & drop files or <span class="filepond--label-action">Browse</span>'
        />
      </div>

      {/* Media Grid */}
      <div style={styles.mediaContainer}>

        {media.length === 0 && !loading ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>🖼️</div>
            <h3>No media found</h3>
            <p>Upload some files to get started</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div style={styles.grid}>
            {media.map((item) => (
            <div
              key={item.id}
              style={{
                ...styles.gridItem,
                ...(selectedIds.has(item.id) ? styles.gridItemSelected : {}),
              }}
            >
              <div style={styles.thumbnailContainer}>
                <img
                  src={getThumbnail(item)}
                  alt={item.altText || item.filename}
                  style={item.mediaType === 'image' ? styles.thumbnail : styles.thumbnailIcon}
                  loading="lazy"
                />
                <span
                  style={{
                    ...styles.typeBadge,
                    background:
                      item.mediaType === 'image'
                        ? '#4a9eff'
                        : item.mediaType === 'audio'
                        ? '#9b59b6'
                        : '#e74c3c',
                  }}
                >
                  {getMediaTypeLabel(item.mediaType)}
                </span>
                {item.refCount > 0 && (
                  <span style={styles.refBadge}>{item.refCount}</span>
                )}
                <label style={styles.gridItemCheckbox}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelection(item.id)}
                    style={styles.checkboxInput}
                  />
                </label>
              </div>
              <div style={styles.gridItemInfo}>
                <div style={styles.itemName} title={item.filename}>
                  {item.filename}
                </div>
                <div style={styles.itemMeta}>
                  {formatSize(item.fileSize)} • {formatDate(item.createdAt)}
                  {item.mediaType === 'image' && item.originalName !== item.filename && (
                    <span style={styles.originalName}> (was {item.originalName.replace(/\.[^.]+$/, '')})</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(item)}
                style={styles.deleteButton}
                title="Delete"
              >
                🗑️
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={styles.list}>
          {media.map((item) => (
            <div
              key={item.id}
              style={{
                ...styles.listItem,
                ...(selectedIds.has(item.id) ? styles.listItemSelected : {}),
              }}
            >
              <label style={styles.listItemCheckbox}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={() => toggleSelection(item.id)}
                  style={styles.checkboxInput}
                />
              </label>
              <div style={styles.listThumbnail}>
                <img
                  src={getThumbnail(item)}
                  alt={item.altText || item.filename}
                  style={item.mediaType === 'image' ? styles.listThumbnailImg : styles.listThumbnailIcon}
                  loading="lazy"
                />
              </div>
              <div style={styles.listInfo}>
                <div style={styles.listName}>{item.filename}</div>
                <div style={styles.listMeta}>
                  {getMediaTypeLabel(item.mediaType)} • {formatSize(item.fileSize)}
                  {item.width && item.height && ` • ${item.width}x${item.height}`}
                  {' • '}
                  {formatDate(item.createdAt)}
                  {item.refCount > 0 && ` • Used ${item.refCount} time${item.refCount === 1 ? '' : 's'}`}
                  {item.mediaType === 'image' && item.originalName !== item.filename && (
                    <span style={styles.originalName}> • Converted from {item.originalName.replace(/\.[^.]+$/, '')}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDelete(item)}
                style={styles.listDeleteButton}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && !loading && (
        <div style={styles.loadMore}>
          <button onClick={() => fetchMedia()} style={styles.loadMoreButton}>
            Load More
          </button>
        </div>
      )}

      {loading && (
        <div style={styles.loading}>
          <div style={styles.spinner} />
          Loading...
        </div>
      )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>Media In Use</h3>
            <p>
              This media is referenced by {deleteConfirm.refCount} item
              {deleteConfirm.refCount === 1 ? '' : 's'}. Deleting it may break
              those items.
            </p>
            <p style={styles.modalFileName}>{deleteConfirm.filename}</p>
            <div style={styles.modalActions}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={styles.modalCancel}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm, true)}
                style={{
                  ...styles.modalDelete,
                  opacity: deleting ? 0.7 : 1,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                }}
                disabled={deleting}
              >
                {deleting ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={styles.buttonSpinner} />
                    Deleting...
                  </span>
                ) : (
                  'Delete Anyway'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation modal */}
      {bulkDeleteConfirm && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>Delete Selected Items</h3>
            <p>
              Are you sure you want to delete {selectedIds.size} selected item
              {selectedIds.size === 1 ? '' : 's'}? This action cannot be undone.
            </p>
            <p style={styles.modalWarning}>
              Items that are currently in use will not be deleted unless you choose
              "Force Delete All".
            </p>
            <div style={styles.modalActions}>
              <button
                onClick={() => setBulkDeleteConfirm(false)}
                style={styles.modalCancel}
                disabled={bulkDeleting}
              >
                Cancel
              </button>
              <button
                onClick={() => handleBulkDelete(false)}
                style={{
                  ...styles.modalDelete,
                  opacity: bulkDeleting ? 0.7 : 1,
                  cursor: bulkDeleting ? 'not-allowed' : 'pointer',
                }}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={styles.buttonSpinner} />
                    Deleting...
                  </span>
                ) : (
                  'Delete Selected'
                )}
              </button>
              <button
                onClick={() => handleBulkDelete(true)}
                style={{
                  ...styles.modalForceDelete,
                  opacity: bulkDeleting ? 0.7 : 1,
                  cursor: bulkDeleting ? 'not-allowed' : 'pointer',
                }}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={styles.buttonSpinner} />
                    Deleting...
                  </span>
                ) : (
                  'Force Delete All'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Styles using CSS variables for theming
const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px',
    color: 'var(--admin-text-primary)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  filepondContainer: {
    marginBottom: '20px',
    flexShrink: 0,
  },
  toolbar: {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px',
    alignItems: 'center',
    flexWrap: 'wrap',
    flexShrink: 0,
  },
  selectAllSection: {
    display: 'flex',
    alignItems: 'center',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
    accentColor: 'var(--admin-accent-primary)',
  },
  checkboxInput: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
    accentColor: 'var(--admin-accent-primary)',
  },
  selectAllText: {
    fontSize: '14px',
    color: 'var(--admin-text-secondary)',
  },
  searchInput: {
    flex: 1,
    padding: '10px 12px',
    background: 'var(--admin-bg-input)',
    border: '1px solid var(--admin-border-secondary)',
    borderRadius: '6px',
    color: 'var(--admin-text-primary)',
    fontSize: '14px',
    minWidth: '200px',
  },
  filterSelect: {
    padding: '10px 12px',
    background: 'var(--admin-bg-input)',
    border: '1px solid var(--admin-border-secondary)',
    borderRadius: '6px',
    color: 'var(--admin-text-primary)',
    fontSize: '14px',
  },
  viewToggle: {
    display: 'flex',
    background: 'var(--admin-bg-input)',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  viewButton: {
    padding: '10px 16px',
    background: 'none',
    border: 'none',
    color: 'var(--admin-text-muted)',
    cursor: 'pointer',
    fontSize: '14px',
  },
  viewButtonActive: {
    background: 'var(--admin-bg-hover)',
    color: 'var(--admin-text-primary)',
  },
  bulkActionsBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'var(--admin-accent-primary)',
    opacity: 0.2,
    borderRadius: '8px',
    marginBottom: '20px',
    border: '1px solid var(--admin-accent-primary)',
  },
  bulkActionsText: {
    fontSize: '14px',
    color: 'var(--admin-text-primary)',
    fontWeight: 500,
  },
  bulkActionsButtons: {
    display: 'flex',
    gap: '8px',
  },
  bulkCancelButton: {
    padding: '8px 16px',
    background: 'none',
    border: '1px solid var(--admin-border-secondary)',
    borderRadius: '6px',
    color: 'var(--admin-text-primary)',
    cursor: 'pointer',
    fontSize: '13px',
  },
  bulkDeleteButton: {
    padding: '8px 16px',
    background: 'var(--admin-accent-danger)',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  },
  error: {
    background: 'rgba(239, 68, 68, 0.2)',
    border: '1px solid var(--admin-accent-danger)',
    color: 'var(--admin-accent-danger)',
    padding: '12px 16px',
    marginBottom: '20px',
    borderRadius: '6px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorClose: {
    background: 'none',
    border: 'none',
    color: 'var(--admin-accent-danger)',
    fontSize: '18px',
    cursor: 'pointer',
  },
  empty: {
    textAlign: 'center',
    padding: '60px 20px',
    color: 'var(--admin-text-muted)',
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '16px',
  },
  gridItem: {
    background: 'var(--admin-bg-card)',
    borderRadius: '8px',
    overflow: 'hidden',
    position: 'relative',
    border: '2px solid transparent',
    transition: 'border-color 0.2s',
  },
  gridItemSelected: {
    borderColor: 'var(--admin-accent-primary)',
    boxShadow: '0 0 0 2px var(--admin-accent-primary)33',
  },
  gridItemCheckbox: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    zIndex: 10,
    background: 'var(--admin-border-primary)',
    borderRadius: '4px',
    padding: '4px',
  },
  thumbnailContainer: {
    position: 'relative',
    aspectRatio: '1',
    background: 'var(--admin-bg-tertiary)',
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
    left: '8px',
    padding: '4px 8px',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '10px',
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  refBadge: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    background: 'var(--admin-accent-danger)',
    color: '#fff',
    padding: '4px 8px',
    borderRadius: '50%',
    fontSize: '12px',
    minWidth: '20px',
    textAlign: 'center',
  },
  gridItemInfo: {
    padding: '12px',
  },
  itemName: {
    fontSize: '13px',
    color: 'var(--admin-text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginBottom: '4px',
  },
  itemMeta: {
    fontSize: '11px',
    color: 'var(--admin-text-muted)',
  },
  deleteButton: {
    position: 'absolute',
    bottom: '8px',
    right: '8px',
    background: 'var(--admin-accent-danger)',
    border: 'none',
    borderRadius: '4px',
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: '14px',
    opacity: 0,
    transition: 'opacity 0.2s',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    background: 'var(--admin-bg-card)',
    borderRadius: '8px',
    border: '2px solid transparent',
    transition: 'border-color 0.2s',
  },
  listItemSelected: {
    borderColor: 'var(--admin-accent-primary)',
    boxShadow: '0 0 0 2px var(--admin-accent-primary)33',
  },
  listItemCheckbox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listThumbnail: {
    width: '60px',
    height: '60px',
    borderRadius: '4px',
    overflow: 'hidden',
    background: 'var(--admin-bg-tertiary)',
    flexShrink: 0,
  },
  listThumbnailImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  listThumbnailIcon: {
    width: '70%',
    height: '70%',
    objectFit: 'contain',
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
  },
  listInfo: {
    flex: 1,
    minWidth: 0,
  },
  listName: {
    fontSize: '14px',
    color: 'var(--admin-text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginBottom: '4px',
  },
  listMeta: {
    fontSize: '12px',
    color: 'var(--admin-text-muted)',
  },
  listDeleteButton: {
    padding: '8px 16px',
    background: 'var(--admin-accent-danger)',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
  },
  loadMore: {
    textAlign: 'center',
    marginTop: '20px',
  },
  loadMoreButton: {
    padding: '12px 24px',
    background: 'var(--admin-bg-card)',
    border: '1px solid var(--admin-border-secondary)',
    borderRadius: '6px',
    color: 'var(--admin-text-primary)',
    cursor: 'pointer',
    fontSize: '14px',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: 'var(--admin-text-muted)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid var(--admin-border-primary)',
    borderTopColor: 'var(--admin-text-primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: 'var(--admin-bg-card)',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '400px',
    width: '90%',
  },
  modalTitle: {
    margin: '0 0 16px 0',
    fontSize: '18px',
    color: 'var(--admin-text-primary)',
  },
  modalFileName: {
    background: 'var(--admin-bg-tertiary)',
    padding: '8px 12px',
    borderRadius: '4px',
    fontSize: '13px',
    color: 'var(--admin-text-muted)',
    marginTop: '12px',
    wordBreak: 'break-all',
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '20px',
    justifyContent: 'flex-end',
  },
  modalCancel: {
    padding: '10px 16px',
    background: 'none',
    border: '1px solid var(--admin-border-secondary)',
    borderRadius: '6px',
    color: 'var(--admin-text-primary)',
    cursor: 'pointer',
    fontSize: '14px',
  },
  modalDelete: {
    padding: '10px 16px',
    background: 'var(--admin-accent-danger)',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
  },
  modalForceDelete: {
    padding: '10px 16px',
    background: 'var(--admin-accent-danger)',
    opacity: 0.8,
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
  },
  modalWarning: {
    fontSize: '13px',
    color: 'var(--admin-accent-warning)',
    marginTop: '12px',
    fontStyle: 'italic',
  },
  originalName: {
    color: 'var(--admin-text-muted)',
    fontStyle: 'italic',
  },
  buttonSpinner: {
    width: '14px',
    height: '14px',
    border: '2px solid transparent',
    borderTopColor: 'currentColor',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  mediaContainer: {
    position: 'relative',
    minHeight: '200px',
    overflow: 'auto',
    flex: 1,
  },
};

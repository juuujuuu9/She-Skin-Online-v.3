/**
 * MediaManager Component
 * 
 * Full media library management for the /admin/uploads page.
 * Features:
 * - Grid view of all media
 * - Upload new files
 * - Delete items (with ref count warning)
 * - Search/filter
 * - Show reference counts
 */

import { useState, useCallback, useEffect } from 'react';
import type { Media } from '@lib/db/schema';

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
  const [uploading, setUploading] = useState(false);
  const [uploadCurrentFile, setUploadCurrentFile] = useState<string>('');
  const [uploadTotalFiles, setUploadTotalFiles] = useState(0);
  const [uploadCurrentIndex, setUploadCurrentIndex] = useState(0);
  const [uploadFadingOut, setUploadFadingOut] = useState(false);
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

  // Get CSRF token from cookie
  const getCsrfToken = () => {
    const match = document.cookie.match(/csrf_token=([^;]+)/);
    return match ? match[1] : '';
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

  // Upload a single file, returns the created media
  const uploadFileWithProgress = (file: File): Promise<Media> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.media) {
              resolve(data.media);
            } else {
              reject(new Error(`Failed to upload ${file.name}`));
            }
          } catch {
            reject(new Error(`Failed to upload ${file.name}`));
          }
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            reject(new Error(data.error || `Failed to upload ${file.name}`));
          } catch {
            reject(new Error(`Failed to upload ${file.name}`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error(`Network error uploading ${file.name}`));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error(`Upload aborted for ${file.name}`));
      });

      xhr.open('POST', '/api/admin/media', true);
      xhr.setRequestHeader('X-CSRF-Token', getCsrfToken());
      xhr.withCredentials = true;
      xhr.send(formData);
    });
  };

  // Handle file upload
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setUploading(true);
    setUploadFadingOut(false);
    setUploadTotalFiles(fileArray.length);
    setUploadCurrentIndex(0);
    setUploadCurrentFile('');
    setError(null);

    const uploadedMedia: Media[] = [];
    const failedFiles: string[] = [];

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setUploadCurrentFile(file.name);
      setUploadCurrentIndex(i + 1);

      try {
        const media = await uploadFileWithProgress(file);
        uploadedMedia.push(media);
      } catch (err) {
        // Track failed file but continue with remaining files
        failedFiles.push(file.name);
        // Continue to next file instead of stopping
      }
    }

    // Add uploaded items to the beginning of the list
    if (uploadedMedia.length > 0) {
      setMedia((prev) => [...uploadedMedia, ...prev]);
      setTotal((prev) => prev + uploadedMedia.length);
    }

    // Show appropriate message based on results
    if (failedFiles.length > 0) {
      if (uploadedMedia.length === 0) {
        setError(`All uploads failed. Last error: ${failedFiles.join(', ')}`);
      } else {
        setError(`${uploadedMedia.length} uploaded, ${failedFiles.length} failed: ${failedFiles.slice(0, 3).join(', ')}${failedFiles.length > 3 ? '...' : ''}`);
      }
    }

    // Complete and fade out
    completeUpload();
  };

  // Complete upload and fade out
  const completeUpload = () => {
    setUploadFadingOut(true);
    setTimeout(() => {
      setUploading(false);
      setUploadFadingOut(false);
      setUploadCurrentFile('');
      setUploadTotalFiles(0);
      setUploadCurrentIndex(0);
    }, 250);
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

  // Handle bulk delete
  const handleBulkDelete = async (force = false) => {
    setBulkDeleting(true);
    const selectedItems = getSelectedItems();
    let deletedCount = 0;
    let inUseCount = 0;
    const inUseItems: Media[] = [];

    for (const item of selectedItems) {
      try {
        const response = await fetch(`/api/admin/media/${item.id}?force=${force}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: {
            'X-CSRF-Token': getCsrfToken(),
          },
        });

        if (response.ok) {
          deletedCount++;
        } else if (response.status === 409) {
          const data = await response.json();
          inUseCount++;
          inUseItems.push({ ...item, refCount: data.refCount });
        }
      } catch {
        // Ignore individual errors
      }
    }

    // Update state
    setMedia((prev) => prev.filter((m) => !selectedIds.has(m.id)));
    setTotal((prev) => prev - deletedCount);
    setSelectedIds(new Set());

    if (inUseCount > 0 && !force) {
      setError(`${inUseCount} item(s) are in use and were not deleted. Click "Force Delete All" to delete anyway.`);
    } else if (deletedCount > 0) {
      setError(null);
    }

    setBulkDeleting(false);
    setBulkDeleteConfirm(false);
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
      return mediaItem.variants?.sm?.url || mediaItem.url;
    }
    if (mediaItem.mediaType === 'audio') {
      return "data:image/svg+xml,%3Csvg fill='%23434343' viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M211.44824,52.50586l-80-24A12.00045,12.00045,0,0,0,116,40V87.73047q-.00587.27539,0,.54785V140.2168A51.97764,51.97764,0,1,0,140,184V104.12842l64.55176,19.36572A12.00045,12.00045,0,0,0,220,112V64A11.99994,11.99994,0,0,0,211.44824,52.50586ZM88,212a28,28,0,1,1,28-28A28.03146,28.03146,0,0,1,88,212ZM196,95.87158,140,79.07129V56.12842l56,16.80029Z'/%3E%3C/svg%3E";
    }
    if (mediaItem.mediaType === 'video') {
      return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23666"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>';
    }
    return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23666"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>';
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
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>
          Media Library
          <span style={styles.count}>({total} items)</span>
        </h2>

        {/* Upload button */}
        <div style={styles.uploadSection}>
          <input
            type="file"
            multiple
            onChange={(e) => handleFileUpload(e.target.files)}
            style={styles.fileInput}
            id="file-upload-multiple"
          />
          <label htmlFor="file-upload-multiple" style={styles.uploadButton}>
            {uploading ? `Uploading ${uploadCurrentIndex}/${uploadTotalFiles}...` : '+ Upload Files'}
          </label>
        </div>
      </div>

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

      {/* Drop zone (visible when dragging) */}
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={styles.dropZone}
      >
        <div style={styles.dropZoneHint}>
          Drop files here to upload
        </div>
      </div>

      {/* Media Grid with Upload Spinner Overlay */}
      <div style={styles.mediaContainer}>
        {/* Upload Spinner Overlay */}
        {uploading && (
          <div
            style={{
              ...styles.spinnerOverlay,
              opacity: uploadFadingOut ? 0 : 1,
            }}
          >
            <div style={styles.spinner} />
            <p style={styles.spinnerText}>Uploading...</p>
            <p style={styles.spinnerSubtext}>Don't close this page until upload completes</p>
            <p style={styles.spinnerFile}>
              {uploadCurrentIndex > 0 ? `File ${uploadCurrentIndex} of ${uploadTotalFiles}: ${uploadCurrentFile}` : 'Starting...'}
            </p>
          </div>
        )}

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
      </div>

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

// Styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px',
    color: '#fff',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  title: {
    margin: 0,
    fontSize: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  count: {
    fontSize: '14px',
    color: '#999',
    fontWeight: 'normal',
  },
  uploadSection: {},
  fileInput: {
    display: 'none',
  },
  uploadButton: {
    display: 'inline-block',
    padding: '10px 20px',
    background: '#4a9eff',
    borderRadius: '6px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
  toolbar: {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px',
    alignItems: 'center',
    flexWrap: 'wrap',
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
    accentColor: '#4a9eff',
  },
  checkboxInput: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
    accentColor: '#4a9eff',
  },
  selectAllText: {
    fontSize: '14px',
    color: '#ccc',
  },
  searchInput: {
    flex: 1,
    padding: '10px 12px',
    background: '#2a2a2a',
    border: '1px solid #444',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
    minWidth: '200px',
  },
  filterSelect: {
    padding: '10px 12px',
    background: '#2a2a2a',
    border: '1px solid #444',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
  },
  viewToggle: {
    display: 'flex',
    background: '#2a2a2a',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  viewButton: {
    padding: '10px 16px',
    background: 'none',
    border: 'none',
    color: '#999',
    cursor: 'pointer',
    fontSize: '14px',
  },
  viewButtonActive: {
    background: '#444',
    color: '#fff',
  },
  bulkActionsBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: '#1a3a5c',
    borderRadius: '8px',
    marginBottom: '20px',
    border: '1px solid #2a5a8c',
  },
  bulkActionsText: {
    fontSize: '14px',
    color: '#fff',
    fontWeight: 500,
  },
  bulkActionsButtons: {
    display: 'flex',
    gap: '8px',
  },
  bulkCancelButton: {
    padding: '8px 16px',
    background: 'none',
    border: '1px solid #666',
    borderRadius: '6px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
  },
  bulkDeleteButton: {
    padding: '8px 16px',
    background: '#ff4444',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  },
  error: {
    background: '#ff444422',
    border: '1px solid #ff4444',
    color: '#ff6666',
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
    color: '#ff6666',
    fontSize: '18px',
    cursor: 'pointer',
  },
  dropZone: {
    border: '2px dashed #444',
    borderRadius: '8px',
    padding: '40px',
    marginBottom: '20px',
    textAlign: 'center',
  },
  dropZoneHint: {
    color: '#666',
    fontSize: '14px',
  },
  empty: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#666',
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
    background: '#2a2a2a',
    borderRadius: '8px',
    overflow: 'hidden',
    position: 'relative',
    border: '2px solid transparent',
    transition: 'border-color 0.2s',
  },
  gridItemSelected: {
    borderColor: '#4a9eff',
    boxShadow: '0 0 0 2px #4a9eff33',
  },
  gridItemCheckbox: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    zIndex: 10,
    background: 'rgba(0,0,0,0.5)',
    borderRadius: '4px',
    padding: '4px',
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
    background: '#e74c3c',
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
    color: '#fff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginBottom: '4px',
  },
  itemMeta: {
    fontSize: '11px',
    color: '#666',
  },
  deleteButton: {
    position: 'absolute',
    bottom: '8px',
    right: '8px',
    background: '#ff4444',
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
    background: '#2a2a2a',
    borderRadius: '8px',
    border: '2px solid transparent',
    transition: 'border-color 0.2s',
  },
  listItemSelected: {
    borderColor: '#4a9eff',
    boxShadow: '0 0 0 2px #4a9eff33',
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
    background: '#1a1a1a',
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
    color: '#fff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginBottom: '4px',
  },
  listMeta: {
    fontSize: '12px',
    color: '#666',
  },
  listDeleteButton: {
    padding: '8px 16px',
    background: '#ff4444',
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
    background: '#2a2a2a',
    border: '1px solid #444',
    borderRadius: '6px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#999',
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
    background: '#2a2a2a',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '400px',
    width: '90%',
  },
  modalTitle: {
    margin: '0 0 16px 0',
    fontSize: '18px',
    color: '#fff',
  },
  modalFileName: {
    background: '#1a1a1a',
    padding: '8px 12px',
    borderRadius: '4px',
    fontSize: '13px',
    color: '#999',
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
    border: '1px solid #444',
    borderRadius: '6px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
  },
  modalDelete: {
    padding: '10px 16px',
    background: '#ff4444',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
  },
  modalForceDelete: {
    padding: '10px 16px',
    background: '#c0392b',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
  },
  modalWarning: {
    fontSize: '13px',
    color: '#ffaa00',
    marginTop: '12px',
    fontStyle: 'italic',
  },
  originalName: {
    color: '#888',
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
  },
  spinnerOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(26, 26, 26, 0.95)',
    zIndex: 50,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '12px',
    transition: 'opacity 0.3s ease-out',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #333',
    borderTopColor: '#4a9eff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px',
  },
  spinnerText: {
    color: '#fff',
    fontSize: '16px',
    fontWeight: 500,
    marginBottom: '8px',
  },
  spinnerSubtext: {
    color: '#999',
    fontSize: '13px',
    marginBottom: '12px',
  },
  spinnerFile: {
    color: '#666',
    fontSize: '12px',
    maxWidth: '80%',
    textAlign: 'center',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};

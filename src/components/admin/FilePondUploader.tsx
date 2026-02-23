/**
 * FilePondUploader Component
 * 
 * A beautiful, unified file upload component using FilePond.
 * Replaces all custom upload inputs across the admin.
 * 
 * Features:
 * - Drag & drop with visual feedback
 * - Image previews (with blurhash support)
 * - Multiple file uploads
 * - Progress indicators
 * - File type/size validation
 * - Integrates with existing /api/admin/media endpoint
 */

import { useState, useCallback, useRef } from 'react';
import { FilePond, registerPlugin } from 'react-filepond';
import FilePondPluginImagePreview from 'filepond-plugin-image-preview';
import FilePondPluginFileValidateType from 'filepond-plugin-file-validate-type';
import FilePondPluginFileValidateSize from 'filepond-plugin-file-validate-size';

// Import FilePond styles
import 'filepond/dist/filepond.min.css';
import 'filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css';

// Register plugins
registerPlugin(
  FilePondPluginImagePreview,
  FilePondPluginFileValidateType,
  FilePondPluginFileValidateSize
);

// Types
export type FileType = 'image' | 'audio' | 'video' | 'document' | 'all';

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: FileType;
  cdnUrl: string;
  url: string;
  mediaType: string;
  variants?: {
    sm?: { url: string; width: number; height: number };
    md?: { url: string; width: number; height: number };
    lg?: { url: string; width: number; height: number };
  };
  width?: number;
  height?: number;
  blurhash?: string | null;
}

interface FilePondUploaderProps {
  /** Called when all uploads complete */
  onUploadComplete?: (files: UploadedFile[]) => void;
  /** Called when each file completes (for multi-upload feedback) */
  onFileComplete?: (file: UploadedFile) => void;
  /** Allowed file types */
  acceptedFileTypes?: string[];
  /** Max file size in bytes (default: 500MB) */
  maxFileSize?: number;
  /** Allow multiple files */
  allowMultiple?: boolean;
  /** Max number of files (when multiple) */
  maxFiles?: number;
  /** Visual style variant */
  variant?: 'dropzone' | 'compact' | 'minimal';
  /** Additional metadata to pass to server */
  metadata?: Record<string, unknown>;
  /** Custom className */
  className?: string;
  /** Whether to auto-upload or wait for manual trigger */
  instantUpload?: boolean;
  /** Label text */
  labelIdle?: string;
  /** Show existing files (for edit mode) */
  files?: UploadedFile[];
  /** Allow reordering (when multiple) */
  allowReorder?: boolean;
}

// Get CSRF token from cookie
const getCsrfToken = () => {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
};

// Get accepted types string for FilePond
const getAcceptedTypes = (fileType: FileType): string[] => {
  switch (fileType) {
    case 'image':
      return ['image/*'];
    case 'audio':
      return ['audio/*'];
    case 'video':
      return ['video/*'];
    case 'document':
      return ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    case 'all':
    default:
      return ['image/*', 'audio/*', 'video/*', 'application/pdf'];
  }
};

// Get file type category
const getFileType = (fileName: string): FileType => {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) return 'audio';
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video';
  return 'document';
};

export function FilePondUploader({
  onUploadComplete,
  onFileComplete,
  acceptedFileTypes,
  maxFileSize = 500 * 1024 * 1024, // 500MB
  allowMultiple = false,
  maxFiles,
  variant = 'dropzone',
  metadata = {},
  className = '',
  instantUpload = true,
  labelIdle,
  files: initialFiles = [],
  allowReorder = false,
}: FilePondUploaderProps) {
  const [files, setFiles] = useState(
    initialFiles.map(f => ({
      source: f.cdnUrl,
      options: {
        type: 'local',
        file: {
          name: f.name,
          size: f.size,
          type: `${f.mediaType}/*`,
        },
      },
    }))
  );
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const pondRef = useRef<FilePond>(null);

  // Custom upload handler that integrates with your API
  const handleProcessFile = useCallback(
    (
      fieldName: string,
      file: File,
      metadata: Record<string, unknown>,
      load: (p: string | { [key: string]: unknown }) => void,
      error: (errorText: string) => void,
      progress: (progressPercent: boolean | number, progressByte: number, totalBytes: number) => void,
      abort: () => void
    ) => {
      const formData = new FormData();
      formData.append(fieldName, file);
      
      // Add custom metadata
      Object.entries(metadata).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, String(value));
        }
      });

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/admin/media', true);
      xhr.setRequestHeader('X-CSRF-Token', getCsrfToken());
      xhr.withCredentials = true;

      // Track progress
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          progress(true, e.loaded, e.total);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.media) {
              const uploadedFile: UploadedFile = {
                id: data.media.id,
                name: data.media.filename,
                size: data.media.fileSize,
                type: getFileType(data.media.filename),
                cdnUrl: data.media.url,
                url: data.media.url,
                mediaType: data.media.mediaType,
                variants: data.media.variants,
                width: data.media.width,
                height: data.media.height,
                blurhash: data.media.blurhash,
              };
              
              setUploadedFiles(prev => [...prev, uploadedFile]);
              onFileComplete?.(uploadedFile);
              
              // Return the file ID as the server file reference
              load(data.media.id);
            } else {
              error(data.error || 'Upload failed');
            }
          } catch {
            error('Invalid response from server');
          }
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            error(data.error || `Upload failed: ${xhr.statusText}`);
          } catch {
            error(`Upload failed: ${xhr.statusText}`);
          }
        }
      };

      xhr.onerror = () => {
        error('Network error during upload');
      };

      xhr.onabort = () => {
        abort();
      };

      xhr.send(formData);

      // Return abort function
      return {
        abort: () => {
          xhr.abort();
        },
      };
    },
    [onFileComplete]
  );

  // Handle when all files are processed
  const handleProcessFiles = () => {
    if (uploadedFiles.length > 0) {
      onUploadComplete?.(uploadedFiles);
    }
  };

  // Server configuration
  const server = instantUpload
    ? {
        process: handleProcessFile,
        revert: null, // We handle delete separately
        restore: null,
        load: null,
        fetch: null,
      }
    : undefined;

  // Get styles based on variant
  const getStyles = () => {
    switch (variant) {
      case 'compact':
        return {
          '.filepond--root': {
            marginBottom: '0',
            fontSize: '14px',
          },
          '.filepond--panel-root': {
            backgroundColor: '#2a2a2a',
            borderRadius: '6px',
          },
          '.filepond--drop-label': {
            minHeight: '60px',
            color: '#999',
          },
        };
      case 'minimal':
        return {
          '.filepond--root': {
            marginBottom: '0',
          },
          '.filepond--panel-root': {
            backgroundColor: 'transparent',
            border: '1px dashed #444',
          },
          '.filepond--drop-label': {
            minHeight: '40px',
            color: '#666',
            fontSize: '12px',
          },
        };
      case 'dropzone':
      default:
        return {
          '.filepond--root': {
            marginBottom: '0',
            fontFamily: 'inherit',
          },
          '.filepond--panel-root': {
            backgroundColor: '#1a1a1a',
            border: '2px dashed #444',
            borderRadius: '8px',
          },
          '.filepond--drop-label': {
            minHeight: '150px',
            color: '#999',
            fontSize: '14px',
          },
          '.filepond--panel-root:hover': {
            borderColor: '#666',
            backgroundColor: '#222',
          },
          '.filepond--drip': {
            backgroundColor: '#1a3a5c',
            opacity: '0.1',
          },
        };
    }
  };

  // Default label based on variant
  const defaultLabel = allowMultiple
    ? 'Drag & drop files or <span class="filepond--label-action">Browse</span>'
    : 'Drag & drop a file or <span class="filepond--label-action">Browse</span>';

  return (
    <div className={`filepond-uploader ${className}`} style={{ width: '100%' }}>
      <style>
        {`
          ${Object.entries(getStyles())
            .map(([selector, styles]) => {
              const styleString = Object.entries(styles)
                .map(([prop, val]) => `${prop.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}: ${val}`)
                .join('; ');
              return `${selector} { ${styleString}; }`;
            })
            .join('\n')}
          
          /* Custom dark theme overrides */
          .filepond--item {
            background: #2a2a2a;
            border-radius: 6px;
          }
          .filepond--file {
            color: #fff;
          }
          .filepond--file-action-button {
            background: rgba(255, 255, 255, 0.2);
            color: #fff;
          }
          .filepond--file-action-button:hover {
            background: rgba(255, 255, 255, 0.3);
          }
          .filepond--progress-indicator {
            color: #4a9eff;
          }
          .filepond--image-preview {
            background: #1a1a1a;
          }
          .filepond--image-preview-overlay {
            color: #4a9eff;
          }
          .filepond--label-action {
            color: #4a9eff;
            text-decoration: none;
            cursor: pointer;
          }
          .filepond--label-action:hover {
            text-decoration: underline;
          }
        `}
      </style>
      
      <FilePond
        ref={pondRef}
        files={files}
        onupdatefiles={setFiles}
        allowMultiple={allowMultiple}
        maxFiles={maxFiles}
        name="file"
        server={server}
        labelIdle={labelIdle || defaultLabel}
        acceptedFileTypes={acceptedFileTypes || ['image/*', 'audio/*', 'video/*', 'application/pdf']}
        maxFileSize={maxFileSize}
        allowImagePreview={true}
        imagePreviewHeight={variant === 'compact' ? 100 : 150}
        allowReorder={allowReorder}
        onprocessfiles={handleProcessFiles}
        credits={false}
        stylePanelAspectRatio={variant === 'minimal' ? null : undefined}
        styleItemPanelAspectRatio={variant === 'compact' ? 0.5 : undefined}
      />
    </div>
  );
}

// Hook for using FilePond in forms
export function useFilePondUpload() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const reset = useCallback(() => {
    setUploadedFiles([]);
    setIsUploading(false);
    setProgress(0);
  }, []);

  const handleFileComplete = useCallback((file: UploadedFile) => {
    setUploadedFiles(prev => [...prev, file]);
  }, []);

  const handleUploadComplete = useCallback((files: UploadedFile[]) => {
    setUploadedFiles(files);
    setIsUploading(false);
    setProgress(100);
  }, []);

  return {
    uploadedFiles,
    isUploading,
    progress,
    reset,
    handleFileComplete,
    handleUploadComplete,
    setIsUploading,
  };
}

export default FilePondUploader;

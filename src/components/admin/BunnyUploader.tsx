/**
 * BunnyUploader Component (FilePond Edition)
 * 
 * Drop-in upload component that uploads directly to Bunny Storage.
 * Uses FilePond for the UI and handles direct Bunny API uploads.
 * 
 * Features:
 * - Direct upload to Bunny CDN
 * - Image previews and validation
 * - Progress indicators
 * - Returns CDN URLs immediately
 */

import { useState, useCallback } from 'react';
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

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: 'image' | 'audio' | 'video' | 'document';
  cdnUrl: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  path: string;
}

interface BunnyUploaderProps {
  /** Called when uploads complete successfully */
  onUploadComplete?: (files: UploadedFile[]) => void;
  /** Called when user selects files (before upload) */
  onSelect?: (files: File[]) => void;
  /** Accepted file types */
  accept?: string;
  /** Max file size in MB */
  maxSizeMB?: number;
  /** Upload destination path in Bunny */
  path?: string;
  /** Visual style */
  variant?: 'dropzone' | 'button' | 'compact';
  /** Custom className */
  className?: string;
  /** Allow multiple files */
  allowMultiple?: boolean;
}

// Storage zone credentials (from env)
const BUNNY_STORAGE_ZONE = import.meta.env.PUBLIC_BUNNY_STORAGE_ZONE || '';
const BUNNY_STORAGE_PASSWORD = import.meta.env.PUBLIC_BUNNY_STORAGE_PASSWORD || '';
const BUNNY_CDN_URL = import.meta.env.PUBLIC_BUNNY_CDN_URL || '';
const BUNNY_STORAGE_ENDPOINT = import.meta.env.PUBLIC_BUNNY_STORAGE_ENDPOINT || 'ny.storage.bunnycdn.com';

// Get file type category
const getFileType = (fileName: string): UploadedFile['type'] => {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) return 'audio';
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video';
  return 'document';
};

export function BunnyUploader({
  onUploadComplete,
  onSelect,
  accept,
  maxSizeMB = 500,
  path = '/uploads/',
  variant = 'dropzone',
  className = '',
  allowMultiple = true,
}: BunnyUploaderProps) {
  const [files, setFiles] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  // Direct upload to Bunny Storage
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
      // Generate unique filename to avoid conflicts
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const fileExt = file.name.split('.').pop() || '';
      const safeName = file.name
        .replace(/\.[^/.]+$/, '') // Remove extension
        .replace(/[^a-z0-9]/gi, '-') // Replace non-alphanumeric with hyphens
        .toLowerCase();
      const fileName = `${safeName}-${timestamp}-${randomStr}.${fileExt}`;
      
      // Full path in storage
      const fullPath = path.startsWith('/') ? path.slice(1) : path;
      const storagePath = `${fullPath}${fileName}`;
      
      // Bunny upload URL
      const uploadUrl = `https://${BUNNY_STORAGE_ENDPOINT}/${BUNNY_STORAGE_ZONE}/${storagePath}`;

      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('AccessKey', BUNNY_STORAGE_PASSWORD);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

      // Track progress
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          progress(true, e.loaded, e.total);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const uploadedFile: UploadedFile = {
            id: `bunny_${timestamp}_${randomStr}`,
            name: file.name,
            size: file.size,
            type: getFileType(file.name),
            cdnUrl: `${BUNNY_CDN_URL}/${storagePath}`,
            path: storagePath,
            status: 'complete',
          };
          
          setUploadedFiles(prev => [...prev, uploadedFile]);
          load(fileName);
        } else {
          error(`Upload failed: ${xhr.statusText}`);
        }
      };

      xhr.onerror = () => {
        error('Network error during upload');
      };

      xhr.onabort = () => {
        abort();
      };

      xhr.send(file);

      return {
        abort: () => {
          xhr.abort();
        },
      };
    },
    [path]
  );

  // Handle when all files are processed
  const handleProcessFiles = () => {
    if (uploadedFiles.length > 0) {
      onUploadComplete?.(uploadedFiles);
    }
  };

  // Handle file add (for onSelect callback)
  const handleAddFile = (error: unknown, file: { file: File }) => {
    if (!error && file) {
      onSelect?.([file.file]);
    }
  };

  // Get accepted types
  const getAcceptedTypes = () => {
    if (accept) {
      return accept.split(',').map(t => t.trim());
    }
    return ['image/*', 'audio/*', 'video/*', 'application/pdf'];
  };

  // Get styles based on variant
  const getStyles = () => {
    const baseStyles = {
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
        color: '#999',
        fontSize: '14px',
      },
      '.filepond--item': {
        background: '#2a2a2a',
        borderRadius: '6px',
      },
      '.filepond--file': {
        color: '#fff',
      },
      '.filepond--label-action': {
        color: '#4a9eff',
        textDecoration: 'none',
      },
      '.filepond--label-action:hover': {
        textDecoration: 'underline',
      },
    };

    switch (variant) {
      case 'compact':
        return {
          ...baseStyles,
          '.filepond--root': {
            ...baseStyles['.filepond--root'],
            fontSize: '14px',
          },
          '.filepond--panel-root': {
            ...baseStyles['.filepond--panel-root'],
            border: '1px solid #444',
          },
          '.filepond--drop-label': {
            ...baseStyles['.filepond--drop-label'],
            minHeight: '60px',
          },
        };
      case 'button':
        return {
          ...baseStyles,
          '.filepond--root': {
            ...baseStyles['.filepond--root'],
            display: 'inline-block',
            width: 'auto',
          },
          '.filepond--panel-root': {
            border: 'none',
            background: '#4a9eff',
          },
          '.filepond--drop-label': {
            minHeight: '40px',
            color: '#fff',
            padding: '10px 20px',
          },
        };
      case 'dropzone':
      default:
        return {
          ...baseStyles,
          '.filepond--panel-root:hover': {
            borderColor: '#666',
            backgroundColor: '#222',
          },
          '.filepond--drop-label': {
            ...baseStyles['.filepond--drop-label'],
            minHeight: '150px',
          },
        };
    }
  };

  // Default label
  const defaultLabel = allowMultiple
    ? 'Drag & drop files or <span class="filepond--label-action">Browse</span>'
    : 'Drag & drop a file or <span class="filepond--label-action">Browse</span>';

  return (
    <div className={`bunny-uploader ${className}`} style={{ width: '100%' }}>
      <style>
        {`
          ${Object.entries(getStyles())
            .map(([selector, styles]) => {
              const styleString = Object.entries(styles as Record<string, string>)
                .map(([prop, val]) => `${prop.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}: ${val}`)
                .join('; ');
              return `${selector} { ${styleString}; }`;
            })
            .join('\n')}
        `}
      </style>
      
      <FilePond
        files={files}
        onupdatefiles={setFiles}
        onaddfile={handleAddFile}
        allowMultiple={allowMultiple}
        maxFiles={allowMultiple ? undefined : 1}
        name="file"
        server={{
          process: handleProcessFile,
          revert: null,
          restore: null,
          load: null,
          fetch: null,
        }}
        labelIdle={defaultLabel}
        acceptedFileTypes={getAcceptedTypes()}
        maxFileSize={maxSizeMB * 1024 * 1024}
        allowImagePreview={true}
        imagePreviewHeight={variant === 'compact' ? 100 : 150}
        onprocessfiles={handleProcessFiles}
        credits={false}
      />
    </div>
  );
}

export default BunnyUploader;

/**
 * Audio Admin Page Client-Side Logic
 *
 * Handles audio post management: create, edit, delete, and media selection
 */

interface AudioPost {
  id: string;
  title: string;
  artist: string;
  audioFile?: string;
  audioMediaId?: string; // Reference to media library
  artwork?: string;
  artworkMediaId?: string; // Reference to media library
  youtubeLink?: string;
  soundcloudLink?: string;
}

interface MediaItem {
  id: string;
  filename: string;
  originalName: string;
  mediaType: string;
  url: string;
  variants?: {
    sm?: { url: string };
    md?: { url: string };
    lg?: { url: string };
  };
}

let audioPosts: AudioPost[] = [];
let editingPostId: string | null = null;

function getCsrfToken(): string {
  const csrfMatch = document.cookie.match(/csrf_token=([^;]+)/);
  return csrfMatch ? decodeURIComponent(csrfMatch[1]) : '';
}

function showFeedback(
  feedback: HTMLElement | null,
  message: string,
  type: 'success' | 'error'
): void {
  if (!feedback) return;
  feedback.textContent = message;
  feedback.className = `mt-4 p-3 rounded-md text-sm ${
    type === 'success'
      ? 'bg-green-900/30 text-green-400 border border-green-800'
      : 'bg-red-900/30 text-red-400 border border-red-800'
  }`;
  feedback.classList.remove('hidden');
  setTimeout(() => feedback.classList.add('hidden'), 3000);
}

/**
 * Render posts list with proper thumbnails
 */
export function renderPosts(
  posts: AudioPost[],
  postsList: HTMLElement,
  emptyState: HTMLElement,
  audioCount: HTMLElement
): void {
  audioCount.textContent = `${posts.length} post${posts.length !== 1 ? 's' : ''}`;

  if (posts.length === 0) {
    emptyState.classList.remove('hidden');
    postsList.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  postsList.classList.remove('hidden');

  // Clear and rebuild using safe DOM methods (prevents XSS)
  postsList.innerHTML = '';

  for (const post of posts) {
    // Create container
    const postDiv = document.createElement('div');
    postDiv.className =
      'flex items-center gap-4 p-4 bg-[#222] rounded-lg border border-[#333] hover:border-[#444] transition-all group';
    postDiv.setAttribute('data-id', post.id);

    // Artwork or placeholder - use thumbnail if available
    if (post.artwork) {
      const img = document.createElement('img');
      // For artwork, try to use a smaller variant by replacing the size in URL
      // Common pattern: image-lg.webp -> image-sm.webp
      const thumbnailUrl = post.artwork.replace(/-(xl|lg|md)\.(webp|jpg|png)/i, '-sm.$2');
      img.src = thumbnailUrl;
      img.alt = '';
      img.className = 'w-16 h-16 object-cover rounded-md shrink-0';
      img.onerror = () => {
        // Fallback to full URL if thumbnail fails
        img.src = post.artwork || '';
      };
      postDiv.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className =
        'w-16 h-16 bg-[#333] rounded-md flex items-center justify-center shrink-0';
      placeholder.innerHTML = `<svg class="w-8 h-8 text-gray-500" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" clip-rule="evenodd" d="M21.6464 2.23699C21.8707 2.42699 22 2.70606 22 3.00001V16C22 18.2091 20.2091 20 18 20C15.7909 20 14 18.2091 14 16C14 13.7909 15.7909 12 18 12C18.7286 12 19.4117 12.1948 20 12.5351V4.18047L10 5.84713V18L9.99999 18.0032C9.99824 20.2109 8.20806 22 6 22C3.79086 22 2 20.2091 2 18C2 15.7909 3.79086 14 6 14C6.72857 14 7.41165 14.1948 8 14.5351V5.00001C8 4.51117 8.35341 4.09398 8.8356 4.01361L20.8356 2.01361C21.1256 1.96529 21.4221 2.04698 21.6464 2.23699ZM20 16C20 14.8954 19.1046 14 18 14C16.8954 14 16 14.8954 16 16C16 17.1046 16.8954 18 18 18C19.1046 18 20 17.1046 20 16ZM6 16C7.10457 16 8 16.8954 8 18C8 19.1046 7.10457 20 6 20C4.89543 20 4 19.1046 4 18C4 16.8954 4.89543 16 6 16Z" /></svg>`;
      postDiv.appendChild(placeholder);
    }

    // Info section
    const infoDiv = document.createElement('div');
    infoDiv.className = 'flex-1 min-w-0';

    // Title - use textContent for XSS protection
    const title = document.createElement('h3');
    title.className = 'text-sm font-medium text-white truncate';
    title.textContent = post.title;
    infoDiv.appendChild(title);

    // Source badges
    const badgesDiv = document.createElement('div');
    badgesDiv.className = 'flex items-center gap-2 mt-1 text-xs text-gray-500';
    if (post.audioFile) {
      badgesDiv.innerHTML += '<span class="text-blue-400">● Audio</span>';
    }
    if (post.youtubeLink) {
      badgesDiv.innerHTML += '<span class="text-red-400">● YouTube</span>';
    }
    if (post.soundcloudLink) {
      badgesDiv.innerHTML += '<span class="text-orange-400">● SoundCloud</span>';
    }
    infoDiv.appendChild(badgesDiv);
    postDiv.appendChild(infoDiv);

    // Action buttons
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'edit-btn p-2 text-gray-400 hover:text-white';
    editBtn.setAttribute('data-id', post.id);
    editBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>`;
    actionsDiv.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn p-2 text-gray-400 hover:text-red-400';
    deleteBtn.setAttribute('data-id', post.id);
    deleteBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>`;
    actionsDiv.appendChild(deleteBtn);

    postDiv.appendChild(actionsDiv);
    postsList.appendChild(postDiv);
  }
}

export async function loadPosts(
  feedback: HTMLElement | null
): Promise<AudioPost[]> {
  try {
    const res = await fetch('/api/admin/audio-posts', { credentials: 'include' });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `HTTP ${res.status}`);
    }
    audioPosts = await res.json();
    return audioPosts;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load';
    showFeedback(feedback, `Failed to load posts: ${message}`, 'error');
    console.error('[audio-admin] loadPosts error:', err);
    return [];
  }
}

/**
 * Fetch media item by URL from the media library
 */
async function fetchMediaByUrl(url: string): Promise<MediaItem | null> {
  try {
    const response = await fetch(`/api/admin/media?search=${encodeURIComponent(url)}`, {
      credentials: 'include',
    });
    if (!response.ok) return null;
    const data = await response.json();
    // Find media that matches the URL (either main URL or in variants)
    const media = data.media?.find((m: MediaItem) => {
      if (m.url === url) return true;
      if (m.variants) {
        return Object.values(m.variants).some((v: { url?: string }) => v?.url === url);
      }
      return false;
    });
    return media || null;
  } catch {
    return null;
  }
}

/**
 * Get the best thumbnail URL for a media item
 */
function getMediaThumbnail(media: MediaItem): string {
  if (media.mediaType === 'image') {
    return media.variants?.sm?.url || media.variants?.md?.url || media.url;
  }
  // Return placeholder for audio/video
  if (media.mediaType === 'audio') {
    return "data:image/svg+xml,%3Csvg viewBox='0 -0.5 17 17' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M6.021,2.188 L6.021,11.362 C5.46,11.327 4.843,11.414 4.229,11.663 C2.624,12.312 1.696,13.729 2.155,14.825 C2.62,15.924 4.294,16.284 5.898,15.634 C7.131,15.134 7.856,14.184 7.965,13.272 L7.958,4.387 L15.02,3.028 L15.02,9.406 C14.422,9.343 13.746,9.432 13.076,9.703 C11.471,10.353 10.544,11.77 11.004,12.866 C11.467,13.964 13.141,14.325 14.746,13.675 C15.979,13.174 16.836,12.224 16.947,11.313 L16.958,0.00199999998 L6.021,2.188 L6.021,2.188 Z' fill='%23434343'/%3E%3C/svg%3E";
  }
  return '';
}

export async function editPost(
  id: string,
  posts: AudioPost[],
  elements: {
    form: HTMLFormElement;
    formTitle: HTMLElement;
    postIdInput: HTMLInputElement;
    saveBtn: HTMLButtonElement;
    cancelBtn: HTMLElement;
  }
): Promise<void> {
  const post = posts.find((p) => p.id === id);
  if (!post) return;

  editingPostId = id;
  elements.postIdInput.value = id;
  (document.getElementById('title') as HTMLInputElement).value = post.title;
  (document.getElementById('artist') as HTMLInputElement).value = post.artist || 'she_skin';
  (document.getElementById('audio-file') as HTMLInputElement).value =
    post.audioFile || '';
  (document.getElementById('artwork') as HTMLInputElement).value =
    post.artwork || '';
  (document.getElementById('youtube-link') as HTMLInputElement).value =
    post.youtubeLink || '';
  (document.getElementById('soundcloud-link') as HTMLInputElement).value =
    post.soundcloudLink || '';

  // Show artwork preview
  if (post.artwork) {
    const img = document.getElementById('artwork-preview-img') as HTMLImageElement;
    const preview = document.getElementById('artwork-preview');
    
    // Try to find the media item to get a proper thumbnail
    const artworkMedia = await fetchMediaByUrl(post.artwork);
    if (artworkMedia) {
      img.src = getMediaThumbnail(artworkMedia);
    } else {
      img.src = post.artwork;
    }
    preview?.classList.remove('hidden');
  }

  // Show audio file preview with proper filename
  if (post.audioFile) {
    const nameEl = document.getElementById('audio-file-name');
    const preview = document.getElementById('audio-preview');
    
    // Try to find the media item to get the original filename
    const audioMedia = await fetchMediaByUrl(post.audioFile);
    if (nameEl) {
      nameEl.textContent = audioMedia?.originalName || audioMedia?.filename || 'Audio file';
    }
    preview?.classList.remove('hidden');
  }

  elements.formTitle.textContent = 'Edit Audio Post';
  elements.saveBtn.textContent = 'Update Post';
  elements.cancelBtn.classList.remove('hidden');
}

export function cancelEdit(
  elements: {
    form: HTMLFormElement;
    formTitle: HTMLElement;
    postIdInput: HTMLInputElement;
    saveBtn: HTMLButtonElement;
    cancelBtn: HTMLElement;
  }
): void {
  editingPostId = null;
  elements.form.reset();
  elements.postIdInput.value = '';
  document.getElementById('artwork-preview')?.classList.add('hidden');
  document.getElementById('audio-preview')?.classList.add('hidden');
  elements.formTitle.textContent = 'New Audio Post';
  elements.saveBtn.textContent = 'Save Post';
  elements.cancelBtn.classList.add('hidden');
}

export async function deletePost(
  id: string,
  feedback: HTMLElement | null,
  onSuccess: () => void
): Promise<void> {
  if (!confirm('Delete this post?')) return;

  const csrfToken = getCsrfToken();

  try {
    const res = await fetch(`/api/admin/audio-posts?id=${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'X-CSRF-Token': csrfToken },
    });

    if (res.ok) {
      audioPosts = audioPosts.filter((p) => p.id !== id);
      onSuccess();
      showFeedback(feedback, 'Post deleted', 'success');
    } else {
      throw new Error('Delete failed');
    }
  } catch {
    showFeedback(feedback, 'Failed to delete post', 'error');
  }
}

export async function savePost(
  isEditing: boolean,
  postId: string | null,
  feedback: HTMLElement | null,
  saveBtn: HTMLButtonElement,
  elements: {
    formTitle: HTMLElement;
    cancelBtn: HTMLElement;
  },
  onSuccess: (savedPost: AudioPost) => void
): Promise<void> {
  const csrfToken = getCsrfToken();

  const data: Partial<AudioPost> = {
    id: postId || undefined,
    title: (document.getElementById('title') as HTMLInputElement).value,
    artist: (document.getElementById('artist') as HTMLInputElement).value || 'she_skin',
    audioFile:
      (document.getElementById('audio-file') as HTMLInputElement).value ||
      undefined,
    artwork:
      (document.getElementById('artwork') as HTMLInputElement).value ||
      undefined,
    youtubeLink:
      (document.getElementById('youtube-link') as HTMLInputElement).value ||
      undefined,
    soundcloudLink:
      (document.getElementById('soundcloud-link') as HTMLInputElement).value ||
      undefined,
  };

  saveBtn.disabled = true;
  saveBtn.textContent = isEditing ? 'Updating...' : 'Saving...';

  try {
    const res = await fetch('/api/admin/audio-posts', {
      method: isEditing ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!res.ok) throw new Error('Save failed');

    const savedPost: AudioPost = await res.json();
    onSuccess(savedPost);

    // Reset form
    editingPostId = null;
    (document.getElementById('post-id') as HTMLInputElement).value = '';
    elements.formTitle.textContent = 'New Audio Post';
    saveBtn.textContent = 'Save Post';
    saveBtn.disabled = false;
    elements.cancelBtn.classList.add('hidden');
    (document.getElementById('audio-post-form') as HTMLFormElement).reset();
    document.getElementById('artwork-preview')?.classList.add('hidden');
    document.getElementById('audio-preview')?.classList.add('hidden');

    showFeedback(feedback, isEditing ? 'Post updated' : 'Post created', 'success');
  } catch {
    saveBtn.disabled = false;
    saveBtn.textContent = isEditing ? 'Update Post' : 'Save Post';
    showFeedback(feedback, 'Failed to save post', 'error');
  }
}

export function getAudioPosts(): AudioPost[] {
  return audioPosts;
}

export function setAudioPosts(posts: AudioPost[]): void {
  audioPosts = posts;
}

export function getEditingPostId(): string | null {
  return editingPostId;
}

export function setEditingPostId(id: string | null): void {
  editingPostId = id;
}

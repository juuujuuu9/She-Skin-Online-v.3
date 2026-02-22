/**
 * Works Page Client-Side Logic
 * Handles gallery filtering, selection mode, form handling, and media selection
 */

// Filter functionality
const filterBtns = document.querySelectorAll('.gallery-filter-btn');
const gallerySections = document.querySelectorAll('.gallery-section');
let activeFilter: string | null = null;

function setGalleryFilter(filter: string | null) {
  activeFilter = filter;

  if (!filter) {
    // Show all sections
    gallerySections.forEach(section => {
      section.classList.remove('hidden');
      const extraItems = section.querySelectorAll('.gallery-item-extra');
      extraItems.forEach(item => item.classList.add('hidden'));
      const showMoreContainer = section.querySelector('.show-more-container');
      if (showMoreContainer) showMoreContainer.classList.remove('hidden');
    });
    // Remove active styling from all buttons
    filterBtns.forEach(b => {
      b.classList.remove('active-filter');
    });
    return;
  }

  // Apply active styling
  filterBtns.forEach(b => {
    if (b.getAttribute('data-filter') === filter) {
      b.classList.add('active-filter');
    } else {
      b.classList.remove('active-filter');
    }
  });

  // Show only matching section
  gallerySections.forEach(section => {
    const sectionType = section.getAttribute('data-section');
    if (sectionType === filter) {
      section.classList.remove('hidden');
      const extraItems = section.querySelectorAll('.gallery-item-extra');
      extraItems.forEach(item => item.classList.remove('hidden'));
      const showMoreContainer = section.querySelector('.show-more-container');
      if (showMoreContainer) showMoreContainer.classList.add('hidden');
    } else {
      section.classList.add('hidden');
    }
  });
}

// Filter button click handlers
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const filter = btn.getAttribute('data-filter');
    if (!filter) return;

    // Toggle off if already active
    if (activeFilter === filter) {
      setGalleryFilter(null);
      return;
    }

    // Set new active filter
    setGalleryFilter(filter);
  });
});

// Show more buttons
document.querySelectorAll('.show-more-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const showType = btn.getAttribute('data-show');
    if (!showType) return;

    // Trigger the corresponding filter button click
    const filterBtn = document.querySelector(`.gallery-filter-btn[data-filter="${showType}"]`) as HTMLElement | null;
    if (filterBtn) {
      filterBtn.click();
    }
  });
});

// Work data store
let editingWorkId: string | null = null;

// Selection mode state
let selectModeActive = false;
let selectedWorkIds: Set<string> = new Set();

const selectModeBtn = document.getElementById('select-mode-btn') as HTMLButtonElement;
const deleteSelectedBtn = document.getElementById('delete-selected-btn') as HTMLButtonElement;
const selectedCountSpan = document.getElementById('selected-count') as HTMLSpanElement;
const galleryContainer = document.querySelector('.p-6.flex-1.min-h-0.overflow-auto') as HTMLElement;
const selectAllContainer = document.getElementById('select-all-container') as HTMLLabelElement;
const selectAllCheckbox = document.getElementById('select-all-checkbox') as HTMLInputElement;

// Toggle selection mode
selectModeBtn?.addEventListener('click', () => {
  selectModeActive = !selectModeActive;

  if (selectModeActive) {
    galleryContainer?.classList.add('select-mode-active');
    selectModeBtn.classList.add('active');
    selectModeBtn.querySelector('span')!.textContent = 'Exit Select';
    selectAllContainer?.classList.remove('hidden');
    selectAllContainer?.classList.add('flex');
  } else {
    galleryContainer?.classList.remove('select-mode-active');
    selectModeBtn.classList.remove('active');
    selectModeBtn.querySelector('span')!.textContent = 'Select Mode';
    selectAllContainer?.classList.add('hidden');
    selectAllContainer?.classList.remove('flex');
    // Clear selections when exiting
    clearSelection();
  }
});

// Clear all selections
function clearSelection() {
  selectedWorkIds.clear();
  updateSelectionUI();
  document.querySelectorAll('.work-checkbox').forEach(cb => {
    (cb as HTMLInputElement).checked = false;
  });
  document.querySelectorAll('[data-id]').forEach(el => {
    el.classList.remove('selected');
  });
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  }
}

// Update selection UI (count and delete button visibility)
function updateSelectionUI() {
  const count = selectedWorkIds.size;
  const totalVisible = getVisibleWorkIds().length;
  selectedCountSpan.textContent = String(count);

  if (count > 0) {
    deleteSelectedBtn.classList.remove('hidden');
  } else {
    deleteSelectedBtn.classList.add('hidden');
  }

  // Update select all checkbox state
  if (selectAllCheckbox) {
    if (count === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    } else if (count === totalVisible) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    }
  }
}

// Get all visible (non-hidden) work IDs
function getVisibleWorkIds(): string[] {
  const ids: string[] = [];
  document.querySelectorAll('[data-id]:not(.hidden)').forEach(el => {
    const id = el.getAttribute('data-id');
    if (id) ids.push(id);
  });
  return ids;
}

// Handle select all checkbox
selectAllCheckbox?.addEventListener('change', (e) => {
  const isChecked = (e.target as HTMLInputElement).checked;
  const visibleIds = getVisibleWorkIds();

  if (isChecked) {
    // Select all visible works
    visibleIds.forEach(id => {
      selectedWorkIds.add(id);
      const card = document.querySelector(`[data-id="${id}"]`) as HTMLElement;
      const checkbox = card?.querySelector('.work-checkbox') as HTMLInputElement;
      if (card) card.classList.add('selected');
      if (checkbox) checkbox.checked = true;
    });
  } else {
    // Deselect all visible works
    visibleIds.forEach(id => {
      selectedWorkIds.delete(id);
      const card = document.querySelector(`[data-id="${id}"]`) as HTMLElement;
      const checkbox = card?.querySelector('.work-checkbox') as HTMLInputElement;
      if (card) card.classList.remove('selected');
      if (checkbox) checkbox.checked = false;
    });
  }

  updateSelectionUI();
});

// Handle checkbox clicks
document.querySelectorAll('.work-checkbox').forEach(checkbox => {
  checkbox.addEventListener('change', (e) => {
    e.stopPropagation();
    const cb = e.target as HTMLInputElement;
    const id = cb.getAttribute('data-id');
    const card = cb.closest('[data-id]') as HTMLElement;

    if (!id) return;

    if (cb.checked) {
      selectedWorkIds.add(id);
      card?.classList.add('selected');
    } else {
      selectedWorkIds.delete(id);
      card?.classList.remove('selected');
    }

    updateSelectionUI();
  });
});

// Handle card clicks in select mode (toggle checkbox)
document.querySelectorAll('[data-id]').forEach(card => {
  card.addEventListener('click', (e) => {
    if (!selectModeActive) return;

    // Don't toggle if clicking on buttons or checkbox directly
    if (
      (e.target as HTMLElement).closest('.work-actions') ||
      (e.target as HTMLElement).closest('.work-checkbox-container') ||
      (e.target as HTMLElement).closest('.edit-work-btn') ||
      (e.target as HTMLElement).closest('.delete-work-btn')
    ) {
      return;
    }

    const checkbox = card.querySelector('.work-checkbox') as HTMLInputElement;
    if (checkbox) {
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change'));
    }
  });
});

// Bulk delete handler
deleteSelectedBtn?.addEventListener('click', async () => {
  if (selectedWorkIds.size === 0) return;

  const ids = Array.from(selectedWorkIds);
  const workTitles: string[] = [];

  // Collect titles for confirmation message
  ids.forEach(id => {
    const checkbox = document.querySelector(`.work-checkbox[data-id="${id}"]`) as HTMLInputElement;
    const title = checkbox?.getAttribute('data-title') || id;
    workTitles.push(title);
  });

  const confirmMessage = selectedWorkIds.size === 1
    ? `Are you sure you want to delete "${workTitles[0]}"? This cannot be undone.`
    : `Are you sure you want to delete ${selectedWorkIds.size} works?\n\n${workTitles.slice(0, 5).join('\n')}${workTitles.length > 5 ? '\n... and ' + (workTitles.length - 5) + ' more' : ''}\n\nThis cannot be undone.`;

  if (!confirm(confirmMessage)) return;

  const csrfMatch = document.cookie.match(/csrf_token=([^;]+)/);
  const csrfToken = csrfMatch ? csrfMatch[1] : '';

  deleteSelectedBtn.disabled = true;
  deleteSelectedBtn.innerHTML = `
    <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <span>Deleting...</span>
  `;

  let successCount = 0;
  let failCount = 0;

  // Delete works in parallel
  const deletePromises = ids.map(async (id) => {
    try {
      const res = await fetch(`/api/admin/works?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrfToken }
      });

      if (!res.ok) throw new Error('Delete failed');

      // Remove card from DOM
      const card = document.querySelector(`[data-id="${id}"]`) as HTMLElement;
      if (card) {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.9)';
        setTimeout(() => card.remove(), 300);
      }

      successCount++;
    } catch (e) {
      failCount++;
      console.error(`Failed to delete work ${id}:`, e);
    }
  });

  await Promise.all(deletePromises);

  // Clear selection
  clearSelection();

  // Reset button
  deleteSelectedBtn.disabled = false;
  deleteSelectedBtn.innerHTML = `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
    <span>Delete Selected</span>
    <span id="selected-count" class="bg-red-200 text-red-800 text-xs px-1.5 py-0.5 rounded-full">0</span>
  `;

  // Re-bind the selected count element
  const newSelectedCountSpan = deleteSelectedBtn.querySelector('#selected-count') as HTMLSpanElement;
  if (newSelectedCountSpan) {
    Object.assign(selectedCountSpan, newSelectedCountSpan);
  }

  // Show feedback
  if (failCount === 0) {
    showFeedback(`Successfully deleted ${successCount} work${successCount === 1 ? '' : 's'}`, 'success');
  } else if (successCount === 0) {
    showFeedback(`Failed to delete ${failCount} work${failCount === 1 ? '' : 's'}`, 'error');
  } else {
    showFeedback(`Deleted ${successCount} work${successCount === 1 ? '' : 's'}, failed to delete ${failCount}`, 'error');
  }

  // If we were editing one of the deleted works, cancel the edit
  if (editingWorkId && selectedWorkIds.has(editingWorkId)) {
    cancelEdit();
  }
});

// Work editing - click on edit buttons
document.querySelectorAll('.edit-work-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = btn.getAttribute('data-id');
    const category = btn.getAttribute('data-category');
    if (id && category) {
      startEdit(id, category);
    }
  });
});

// Work deletion
document.querySelectorAll('.delete-work-btn').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const id = btn.getAttribute('data-id');
    if (!id) return;
    
    if (!confirm('Are you sure you want to delete this work? This cannot be undone.')) return;
    
    const csrfMatch = document.cookie.match(/csrf_token=([^;]+)/);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';
    
    try {
      const res = await fetch(`/api/admin/works?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRF-Token': csrfToken }
      });
      
      if (!res.ok) throw new Error('Delete failed');
      
      // Remove the card from DOM
      const card = btn.closest('[data-id]') as HTMLElement | null;
      if (card) {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.9)';
        setTimeout(() => card.remove(), 300);
      }
      
      showFeedback('Work deleted successfully', 'success');
      
      // If we were editing this work, cancel the edit
      if (editingWorkId === id) {
        cancelEdit();
      }
    } catch (e) {
      showFeedback('Failed to delete work', 'error');
    }
  });
});

// Form handling
const form = document.getElementById('work-form') as HTMLFormElement;
const formTitle = document.getElementById('form-title') as HTMLElement;
const workIdInput = document.getElementById('work-id') as HTMLInputElement;
const cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement;
const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
const feedback = document.getElementById('form-feedback') as HTMLElement;
const forSaleCheckbox = document.getElementById('for-sale') as HTMLInputElement;
const priceField = document.getElementById('price-field') as HTMLElement;
const titleInput = document.getElementById('title') as HTMLInputElement;
const slugInput = document.getElementById('slug') as HTMLInputElement;

// Auto-generate slug from title
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')      // Remove special characters
    .replace(/\s+/g, '-')           // Replace spaces with hyphens
    .replace(/-+/g, '-');          // Collapse multiple hyphens
}

titleInput?.addEventListener('input', () => {
  // Don't auto-generate slug when editing an existing work
  if (editingWorkId) return;
  
  // Only auto-generate if slug is empty or matches previous auto-generated value
  const currentSlug = slugInput?.value || '';
  const currentTitle = titleInput?.value || '';
  const expectedSlug = generateSlug(currentTitle);
  const previousExpectedSlug = generateSlug(titleInput.dataset.previousTitle || '');

  if (currentSlug === '' || currentSlug === previousExpectedSlug) {
    slugInput.value = expectedSlug;
  }

  // Store current title for next comparison
  titleInput.dataset.previousTitle = currentTitle;
});

// Show/hide price field based on for sale checkbox
forSaleCheckbox?.addEventListener('change', () => {
  if (forSaleCheckbox.checked) {
    priceField.classList.remove('hidden');
  } else {
    priceField.classList.add('hidden');
  }
});

// Show feedback message
function showFeedback(message: string, type: 'success' | 'error') {
  feedback.textContent = message;
  feedback.className = `mt-4 p-3 rounded-md text-sm ${type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`;
  feedback.classList.remove('hidden');
  setTimeout(() => feedback.classList.add('hidden'), 3000);
}

// Cancel button
cancelBtn?.addEventListener('click', cancelEdit);

// Form submission
form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const csrfMatch = document.cookie.match(/csrf_token=([^;]+)/);
  const csrfToken = csrfMatch ? csrfMatch[1] : '';

  const formData = new FormData(form);
  const data = {
    id: workIdInput.value || undefined,
    category: formData.get('category') as string,
    title: formData.get('title') as string,
    slug: formData.get('slug') as string,
    description: formData.get('description') as string || undefined,
    year: formData.get('year') ? parseInt(formData.get('year') as string) : undefined,
    forSale: formData.get('forSale') === 'on',
    price: formData.get('price') ? (formData.get('price') as string) : undefined,
    externalUrl: formData.get('externalUrl') as string || undefined,
    mediaIds: selectedMediaIds,
  };

  saveBtn.disabled = true;
  saveBtn.textContent = workIdInput.value ? 'Updating...' : 'Creating...';

  try {
    const res = await fetch('/api/admin/works', {
      method: workIdInput.value ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      credentials: 'include',
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Save failed');
    }

    const result = await res.json();
    showFeedback(workIdInput.value ? 'Work updated' : 'Work created', 'success');
    
    // Reset form and reload page to show updated gallery
    cancelEdit();
    setTimeout(() => window.location.reload(), 500);
  } catch (e) {
    showFeedback(e instanceof Error ? e.message : 'Failed to save work', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = workIdInput.value ? 'Update Work' : 'Save Work';
  }
});

// Media selection
let selectedMediaIds: string[] = [];
let selectedMediaItems: Array<{id: string; url: string; type: string}> = [];

const mediaModal = document.getElementById('media-modal') as HTMLElement;
const mediaModalBackdrop = document.getElementById('media-modal-backdrop') as HTMLElement;
const chooseMediaBtn = document.getElementById('choose-media-btn') as HTMLButtonElement;
const mediaPreview = document.getElementById('media-preview') as HTMLElement;
const mediaPreviewGrid = document.getElementById('media-preview-grid') as HTMLElement;
const clearMediaBtn = document.getElementById('clear-media') as HTMLButtonElement;

function openMediaModal() {
  mediaModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeMediaModal() {
  mediaModal.classList.add('hidden');
  document.body.style.overflow = '';
}

chooseMediaBtn?.addEventListener('click', openMediaModal);
mediaModalBackdrop?.addEventListener('click', closeMediaModal);

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !mediaModal.classList.contains('hidden')) {
    closeMediaModal();
  }
});

// Clear media selection
function clearMediaSelection() {
  selectedMediaIds = [];
  selectedMediaItems = [];
  updateMediaPreview();
}

clearMediaBtn?.addEventListener('click', clearMediaSelection);

function updateMediaPreview() {
  if (selectedMediaItems.length === 0) {
    mediaPreview.classList.add('hidden');
    return;
  }

  mediaPreview.classList.remove('hidden');
  mediaPreviewGrid.innerHTML = selectedMediaItems.map(item => `
    <div class="aspect-square rounded-md overflow-hidden border border-gray-200">
      <img src="${item.url}" alt="" class="w-full h-full object-cover" />
    </div>
  `).join('');
}

// Set form category and toggle form visibility
function setFormCategory(category: string | null) {
  const categorySelector = document.getElementById('category-selector') as HTMLElement;
  const formFields = document.getElementById('form-fields') as HTMLElement;
  const categoryInput = document.getElementById('category') as HTMLInputElement;
  const activeCategoryLabel = document.getElementById('active-category-label') as HTMLElement;
  const activeCategoryIcon = document.getElementById('active-category-icon') as HTMLElement;

  if (category) {
    categoryInput.value = category;
    categorySelector.classList.add('hidden');
    formFields.classList.remove('hidden');
    activeCategoryLabel.textContent = category;

    // Set icon based on category
    const iconPaths: Record<string, string> = {
      physical: `<svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>`,
      collaborations: `<svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>`,
      digital: `<svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>`,
    };
    activeCategoryIcon.innerHTML = iconPaths[category] || '';
  } else {
    categoryInput.value = '';
    categorySelector.classList.remove('hidden');
    formFields.classList.add('hidden');
    activeCategoryLabel.textContent = '';
    activeCategoryIcon.innerHTML = '';
  }
}

// Category option buttons
document.querySelectorAll('.category-option').forEach(btn => {
  btn.addEventListener('click', () => {
    const category = btn.getAttribute('data-category');
    if (category) {
      setFormCategory(category);
    }
  });
});

// Change category button
document.getElementById('change-category-btn')?.addEventListener('click', () => {
  setFormCategory(null);
});

// Start editing a work
async function startEdit(id: string, category: string) {
  try {
    const res = await fetch(`/api/admin/works?id=${encodeURIComponent(id)}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load work');

    const work = await res.json();

    editingWorkId = id;
    workIdInput.value = id;
    formTitle.textContent = 'Edit Work';
    saveBtn.textContent = 'Update Work';
    cancelBtn.classList.remove('hidden');

    // Set category
    setFormCategory(category);

    // Populate form fields
    (document.getElementById('title') as HTMLInputElement).value = work.title || '';
    (document.getElementById('slug') as HTMLInputElement).value = work.slug || '';
    (document.getElementById('description') as HTMLTextAreaElement).value = work.description || '';
    (document.getElementById('year') as HTMLInputElement).value = work.year ? String(work.year) : '';
    (document.getElementById('external-url') as HTMLInputElement).value = work.externalUrl || '';

    // Handle for sale
    const forSaleCheckbox = document.getElementById('for-sale') as HTMLInputElement;
    forSaleCheckbox.checked = work.forSale || false;
    if (work.forSale) {
      priceField.classList.remove('hidden');
      (document.getElementById('price') as HTMLInputElement).value = work.price || '';
    } else {
      priceField.classList.add('hidden');
    }

    // Load media
    if (work.media && work.media.length > 0) {
      selectedMediaIds = work.media.map((m: any) => m.id);
      selectedMediaItems = work.media.map((m: any) => ({
        id: m.id,
        url: m.variants?.sm?.url || m.variants?.md?.url || m.url,
        type: m.mediaType || 'image'
      }));
      updateMediaPreview();
    } else {
      clearMediaSelection();
    }

    // Filter gallery to show this category
    setGalleryFilter(category);

    showFeedback('Work loaded for editing', 'success');
  } catch (e) {
    showFeedback('Failed to load work for editing', 'error');
    console.error(e);
  }
}

// Cancel editing
function cancelEdit() {
  editingWorkId = null;
  workIdInput.value = '';
  formTitle.textContent = 'New Work';
  saveBtn.textContent = 'Save Work';
  cancelBtn.classList.add('hidden');
  form.reset();
  priceField.classList.add('hidden');
  clearMediaSelection();
  setFormCategory(null);
  setGalleryFilter(null);
}

// Handle media selection from MediaSelector component
window.addEventListener('mediaSelected', ((e: CustomEvent) => {
  const media = e.detail;
  if (!media) return;
  
  const id = media.id;
  const url = media.variants?.sm?.url || media.variants?.md?.url || media.url;
  
  if (selectedMediaIds.includes(id)) {
    // Deselect
    selectedMediaIds = selectedMediaIds.filter(mid => mid !== id);
    selectedMediaItems = selectedMediaItems.filter(item => item.id !== id);
  } else {
    // Select (allow multiple)
    selectedMediaIds.push(id);
    selectedMediaItems.push({ id, url, type: 'image' });
  }
  
  updateMediaPreview();
}) as EventListener);

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !mediaModal.classList.contains('hidden')) {
    closeMediaModal();
  }
});

/**
 * Works Page Client-Side Logic
 * Handles gallery filtering, selection mode, and bulk operations
 */

function initWorksPage() {
  // Check if we're on the works page
  const galleryContainer = document.querySelector('.p-6.flex-1.min-h-0.overflow-auto') as HTMLElement;
  if (!galleryContainer) return; // Not on works page

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

  // Filter button click handlers using event delegation
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.gallery-filter-btn') as HTMLElement;
    if (!btn || !document.contains(btn)) return;
    
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

  // Show more buttons using event delegation
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.show-more-btn') as HTMLElement;
    if (!btn) return;
    
    const showType = btn.getAttribute('data-show');
    if (!showType) return;

    // Trigger the corresponding filter button click
    const filterBtn = document.querySelector(`.gallery-filter-btn[data-filter="${showType}"]`) as HTMLElement | null;
    if (filterBtn) {
      filterBtn.click();
    }
  });

  // Work data store
  let editingWorkId: string | null = null;

  // Selection mode state
  let selectModeActive = false;
  let selectedWorkIds: Set<string> = new Set();

  const selectModeBtn = document.getElementById('select-mode-btn') as HTMLButtonElement;
  const deleteSelectedBtn = document.getElementById('delete-selected-btn') as HTMLButtonElement;
  const selectedCountSpan = document.getElementById('selected-count') as HTMLSpanElement;
  const selectAllContainer = document.getElementById('select-all-container') as HTMLLabelElement;
  const selectAllCheckbox = document.getElementById('select-all-checkbox') as HTMLInputElement;

  // Toggle selection mode
  selectModeBtn?.addEventListener('click', () => {
    selectModeActive = !selectModeActive;

    if (selectModeActive) {
      galleryContainer?.classList.add('select-mode-active');
      selectModeBtn.classList.add('active');
      const span = selectModeBtn.querySelector('span');
      if (span) span.textContent = 'Exit Select';
      selectAllContainer?.classList.remove('hidden');
      selectAllContainer?.classList.add('flex');
    } else {
      galleryContainer?.classList.remove('select-mode-active');
      selectModeBtn.classList.remove('active');
      const span = selectModeBtn.querySelector('span');
      if (span) span.textContent = 'Select Mode';
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
    if (selectedCountSpan) selectedCountSpan.textContent = String(count);

    if (count > 0) {
      deleteSelectedBtn?.classList.remove('hidden');
    } else {
      deleteSelectedBtn?.classList.add('hidden');
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

  // Handle checkbox clicks using event delegation
  document.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('work-checkbox')) return;
    
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

  // Handle card clicks in select mode (toggle checkbox) using event delegation
  document.addEventListener('click', (e) => {
    if (!selectModeActive) return;
    
    const target = e.target as HTMLElement;
    const card = target.closest('[data-id]') as HTMLElement;
    if (!card) return;

    // Don't toggle if clicking on buttons or checkbox directly
    if (
      target.closest('.work-actions') ||
      target.closest('.work-checkbox-container') ||
      target.closest('.edit-work-btn') ||
      target.closest('.delete-work-btn')
    ) {
      return;
    }

    const checkbox = card.querySelector('.work-checkbox') as HTMLInputElement;
    if (checkbox) {
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change'));
    }
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
    const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : '';

    if (deleteSelectedBtn) {
      deleteSelectedBtn.disabled = true;
      deleteSelectedBtn.innerHTML = `
        <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Deleting...</span>
      `;
    }

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
    if (deleteSelectedBtn) {
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
    }

    // Show feedback using WorkEditor's feedback function if available
    const feedbackEl = document.getElementById('form-feedback') as HTMLElement;
    if (feedbackEl) {
      if (failCount === 0) {
        showFeedback(`Successfully deleted ${successCount} work${successCount === 1 ? '' : 's'}`, 'success');
      } else if (successCount === 0) {
        showFeedback(`Failed to delete ${failCount} work${failCount === 1 ? '' : 's'}`, 'error');
      } else {
        showFeedback(`Deleted ${successCount} work${successCount === 1 ? '' : 's'}, failed to delete ${failCount}`, 'error');
      }
    }

    // If we were editing one of the deleted works, cancel the edit via WorkEditor
    if (editingWorkId && selectedWorkIds.has(editingWorkId)) {
      const workEditor = (window as any).WorkEditor;
      if (workEditor?.cancelEdit) {
        workEditor.cancelEdit();
      }
    }
  });

  // Helper to show feedback
  function showFeedback(message: string, type: 'success' | 'error') {
    const feedback = document.getElementById('form-feedback') as HTMLElement;
    if (!feedback) return;
    feedback.textContent = message;
    feedback.className = `mt-4 p-3 rounded-md text-sm ${type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`;
    feedback.classList.remove('hidden');
    setTimeout(() => feedback.classList.add('hidden'), 3000);
  }

  // Note: Individual work editing and deletion are handled by the inline script in works.astro
  // This script focuses on selection mode and bulk operations
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWorksPage);
} else {
  initWorksPage();
}

// Re-initialize after Astro view transitions
document.addEventListener('astro:page-load', initWorksPage);

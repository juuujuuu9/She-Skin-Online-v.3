# SheSkin Plan of Action
## Cross-Referenced from AUDIT_REPORT_2026_02_22.md
**Date:** 2026-02-22  
**Goal:** Address bloat, performance, dual logic, and overengineering while preserving ALL UI/UX states and flows

---

## Executive Summary

This plan addresses four critical areas of technical debt while ensuring zero disruption to the existing user experience. All current UI patterns, interactions, and visual states documented below will be preserved exactly.

### Current UI/UX State Inventory

The following patterns are consistent across admin pages and MUST be preserved:

#### 1. Visual Design System
| Element | Current Value | Location |
|---------|---------------|----------|
| Background (page) | `#0a0a0a` | body bg |
| Background (content) | `#111` | main content |
| Background (cards) | `#1a1a1a` | panels/cards |
| Border color | `#333` | borders |
| Border hover | `#555` | hover states |
| Primary action | `bg-blue-600` | save/submit |
| Destructive action | `bg-red-500` | delete buttons |
| Text primary | `text-white` | headings |
| Text secondary | `text-gray-400` | descriptions |
| Text muted | `text-gray-500` | metadata |

#### 2. Layout Patterns
- **Sidebar:** Fixed 256px width (`w-64`), dark background, white text
- **Active nav item:** `bg-white text-black` (high contrast)
- **Inactive nav item:** `text-white/80 hover:bg-white/10`
- **Main content:** `flex-1 min-w-0 bg-[#111] overflow-y-auto`
- **Container:** `max-w-7xl mx-auto p-6`

#### 3. Navigation Structure (All Admin Pages)
```
Uploads (/admin) - dashboard icon
Media Library (/admin/media) - image icon  
ICT★SNU SOUND (/admin/audio) - audio icon
Works (/admin/works) - lightbulb icon
Inventory (/admin/products) - shopping bag icon
Homepage (/admin/homepage) - home icon
```

#### 4. Card/Panel Patterns
- Rounded: `rounded-xl` (12px)
- Border: `border border-[#333]`
- Padding: `p-6`
- Shadow: `shadow-sm` (light) or `shadow-2xl` (modals)

#### 5. Form Patterns
- Inputs: `bg-[#222] border-[#444] rounded-md text-white`
- Focus ring: `focus:ring-2 focus:ring-blue-500`
- Labels: `text-sm font-medium text-gray-300 mb-1`

#### 6. Modal Patterns
- Backdrop: `bg-black/70 backdrop-blur-sm`
- Container: `absolute inset-4 md:inset-8 lg:inset-16`
- Border: `border border-[#333]`

#### 7. Grid Layouts
- Works grid: `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4`
- Media grid: Same as works
- Cards have `aspect-square` containers

#### 8. Interaction Patterns
- **Bulk selection:** Checkbox appears on hover, top-right of cards
- **Delete button:** Appears on hover, bottom-right of cards, red background
- **Select Mode:** Toggle button that shows/hides checkboxes across all items
- **Filter tabs:** Pill-style buttons that highlight active filter
- **Show more:** "+N more" link below collapsed sections

#### 9. Button Patterns
- Primary: `bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md`
- Secondary: `bg-[#333] hover:bg-[#444] border border-[#444]`
- Destructive: `bg-red-500/80 hover:bg-red-600 text-white rounded`
- Ghost: `text-gray-400 hover:text-white` (icon buttons)

---

## Issue Category 1: CODE BLOAT

### Problem Statement
Three admin files significantly exceed the 300-line limit, containing duplicated logic and inline everything.

### Current State Analysis

#### `admin/works.astro` (1,494 lines) - CRITICAL PRIORITY
**Current Responsibilities:**
1. Server-side: Auth, CSRF, database queries for 3 work categories
2. Sidebar navigation (6 items with icon SVGs)
3. Works gallery with 3 category sections (Physical, Collaborations, Digital)
4. Filter buttons with count badges
5. Select mode with bulk operations (select all, delete selected)
6. "Show more" expansion for each category (>8 items)
7. Create/Edit form with category selector
8. Media selection modal integration
9. Client-side: 700+ lines of JavaScript for:
   - Gallery filtering
   - Selection mode state management
   - Bulk delete operations
   - Form handling with slug auto-generation
   - Media selection/preview
   - Edit mode with data population
   - Cancel/reset functionality

**Duplication Identified:**
- Sidebar navigation: 100% identical to index.astro and audio.astro
- Icon path definitions: 100% identical across all admin pages
- Logout button functionality: Repeated on every page
- CSRF token handling pattern: Repeated

#### `admin/index.astro` (811 lines) - HIGH PRIORITY
**Current Responsibilities:**
1. Server-side: Auth, media listing
2. Sidebar navigation (identical to works.astro)
3. Upload area with drag-and-drop
4. Stats counters (images/audio/video)
5. Recent uploads grid with type badges
6. Bulk selection UI
7. Upload spinner overlay
8. Empty states
9. Client-side: 500+ lines for:
   - Drag-and-drop handling
   - XHR upload with progress
   - Dynamic media item creation
   - Bulk selection state
   - Delete operations (individual + bulk)

#### `admin/audio.astro` (582 lines) - MEDIUM PRIORITY
**Current Responsibilities:**
1. Server-side: Auth (no data fetching - client-side loads posts)
2. Sidebar navigation (identical)
3. Audio post form (title, audio file, artwork, YouTube, SoundCloud)
4. Artwork selection modal
5. Audio file selection modal
6. Posts list with status badges
7. Client-side: 300+ lines for:
   - Post CRUD operations
   - Modal handling
   - Form state management

### Plan of Action: Code Bloat

#### Phase 1: Extract Shared Admin Layout (Days 1-2)
**Objective:** Create a single shared layout component for all admin pages.

**New Files:**
```
src/layouts/AdminLayout.astro       # 150 lines max
src/components/admin/AdminNav.astro # 80 lines max
src/lib/admin/nav.ts                # Navigation configuration
```

**AdminLayout.astro Responsibilities:**
- Server-side auth check with redirect
- CSRF token generation
- Sidebar navigation rendering
- Logout button with handler
- "View Site" link
- Dark theme wrapper
- Slot for page-specific content

**UI/UX Preservation Requirements:**
- Sidebar must remain fixed 256px width
- Active nav item must use `bg-white text-black`
- Logout button must be in header area
- View Site link must be at bottom of sidebar
- All hover states must be preserved

**Migration Plan:**
1. Create AdminLayout.astro with identical HTML structure
2. Move navItems and iconPaths to shared config
3. Update works.astro to use AdminLayout
4. Update index.astro to use AdminLayout
5. Update audio.astro to use AdminLayout

**Expected Reduction:**
- works.astro: 1,494 → ~1,200 lines (-294 lines)
- index.astro: 811 → ~550 lines (-261 lines)
- audio.astro: 582 → ~450 lines (-132 lines)

#### Phase 2: Extract Works-Specific Components (Days 3-4)
**Objective:** Break works.astro into focused components.

**New Files:**
```
src/components/admin/works/
├── WorkGallery.tsx        # Gallery grid with filtering (~200 lines)
├── WorkCard.tsx           # Individual work card (~80 lines)
├── WorkEditor.tsx         # Create/Edit form (~250 lines)
├── CategoryFilter.tsx     # Filter buttons with counts (~60 lines)
├── BulkActions.tsx        # Select mode + bulk delete (~100 lines)
└── MediaPickerModal.tsx   # Media selection wrapper (~50 lines)
```

**WorkGallery.tsx Responsibilities:**
- Display 3 category sections
- Handle "show more" expansion
- Support filter-based visibility
- Render WorkCard components
- Manage selection state (passed from parent)

**WorkCard.tsx Responsibilities:**
- Render work thumbnail
- Show title overlay on hover
- Display edit/delete buttons on hover
- Selection checkbox (visible in select mode)
- Hover scale effect

**WorkEditor.tsx Responsibilities:**
- Category selector (Physical/Collaborations/Digital)
- Form fields: title, slug, description, year, forSale, price, externalUrl
- Media selection button
- Selected media preview grid
- Save/Cancel buttons
- Form validation feedback

**UI/UX Preservation Requirements:**
- Cards must maintain `aspect-square` and hover effects
- Title overlay must be `bg-linear-to-t from-black/80`
- Edit/Delete buttons must appear on hover (opacity transition)
- Selection mode must highlight selected cards with blue border
- Form category buttons must match current style

**Expected Final works.astro:** ~300 lines (shell page only)

#### Phase 3: Extract Upload Dashboard Components (Day 5)
**Objective:** Break index.astro into focused components.

**New Files:**
```
src/components/admin/upload/
├── UploadDropzone.tsx     # Drag-and-drop area (~80 lines)
├── MediaStats.tsx         # Image/Audio/Video counters (~40 lines)
├── MediaGrid.tsx          # Recent uploads grid (~120 lines)
├── MediaCard.tsx          # Individual media item (~60 lines)
└── BulkActionsBar.tsx     # Selection + bulk delete (~80 lines)
```

**Expected Final index.astro:** ~300 lines (shell page only)

#### Phase 4: Extract Audio Components (Day 6)
**Objective:** Break audio.astro into focused components.

**New Files:**
```
src/components/admin/audio/
├── AudioPostForm.tsx      # Form with all fields (~150 lines)
├── AudioPostsList.tsx     # List of audio posts (~80 lines)
└── AudioPostCard.tsx       # Individual post card (~60 lines)
```

**Expected Final audio.astro:** ~300 lines (shell page only)

---

## Issue Category 2: PERFORMANCE ISSUES

### Problem Statement
Client-side JavaScript is heavy, blocks rendering, and lacks code splitting.

### Current State Analysis

#### Inefficient Patterns Found:
1. **Large inline scripts:** Works.astro has 700+ lines of inline JS
2. **No code splitting:** All admin JS bundled together
3. **Full data loading:** Works page loads ALL works from all categories server-side
4. **No pagination:** Media grid loads up to 100 items
5. **Client-side audio posts:** audio.astro loads posts client-side (good) but renders inline

#### Performance Bottlenecks:
```
/admin/works:
- 3 database queries (parallel)
- All works loaded server-side (could be 100s)
- 700+ lines of JS inline

/admin:
- 1 database query (limit 100)
- 500+ lines of JS inline

/admin/audio:
- No server-side data (good)
- Client-side fetch (good)
- But inline script is still large
```

### Plan of Action: Performance

#### Step 1: Implement Pagination for Works (Day 7)
**Current:** Loads all works for all categories  
**Target:** Load 12 per category with "Load More" button

**Changes:**
```typescript
// New API endpoint
GET /api/admin/works?category=physical&limit=12&offset=0

// Client-side pagination
WorkGallery.tsx loads more on scroll or button click
```

**UI/UX Preservation:**
- Keep existing "+N more" button pattern
- Maintain smooth fade-in for new items
- Loading state: spinner in button or section

#### Step 2: Move Scripts to External Files (Day 8)
**Current:** All JavaScript inline in `.astro` files  
**Target:** External `.ts` files imported with `hoist`

**New Files:**
```
src/lib/admin-client/
├── works-gallery.ts       # Gallery filtering, selection
├── works-form.ts          # Form handling, media selection
├── upload-dashboard.ts    # Drag-drop, upload progress
└── audio-posts.ts         # Post CRUD, modals
```

**Example Migration:**
```astro
<!-- Before -->
<script>
  // 700 lines inline
</script>

<!-- After -->
<script src="../lib/admin-client/works-gallery.ts" hoist></script>
```

**Benefits:**
- Browser caching of JS
- Better editor support (TypeScript)
- Easier testing

#### Step 3: Optimize Media Loading (Day 9)
**Current:** Loads up to 100 media items on admin dashboard  
**Target:** Load 12 initially, infinite scroll or pagination

**Changes:**
- Add `limit: 12` to dashboard query
- Add "View Full Media Library" link (already exists, enhance it)
- Implement intersection observer for lazy loading

**UI/UX Preservation:**
- Stats section must still show total counts (separate query)
- "View all N items" link behavior unchanged

#### Step 4: Preload Critical Resources (Day 10)
**Current:** No resource hints  
**Target:** Add preload for critical fonts and first paint CSS

**Changes:**
```astro
<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin />
```

---

## Issue Category 3: DUAL LOGIC

### Problem Statement
Same functionality implemented differently across pages (auth, CSRF, navigation, logout).

### Current State Analysis

#### Authentication Pattern Comparison:
```
works.astro:
- const auth = await checkAdminAuth(Astro.request);
- if (!auth.valid) return Astro.redirect('/admin/login');

index.astro:
- const auth = await checkAdminAuth(Astro.request);
- if (!auth.valid) {
-   const reason = auth.debug || 'unknown';
-   return Astro.redirect(`/admin/login?session=expired&reason=${encodeURIComponent(reason)}`);
- }

audio.astro:
- Same as index.astro
```

**Inconsistency:** works.astro doesn't pass debug reason, others do.

#### CSRF Pattern Comparison:
```
All pages use identical pattern:
- const csrf = generateCsrfToken();
- Astro.response.headers.set('Set-Cookie', csrf.cookie);
- <script is:inline define:vars={{ csrfToken: csrf.token }}>
```

**Issue:** Duplicated in every page instead of shared.

#### Logout Handler Comparison:
```
All pages have identical logout handler (copied/pasted)
```

#### Navigation Pattern:
```
All pages define identical:
- adminNavItems array (6 items)
- iconPaths object (6 icons)
- isActive() function
```

### Plan of Action: Dual Logic

#### Step 1: Standardize Auth Handling (Day 11)
**Create Shared Helper:**
```typescript
// src/lib/admin/page-setup.ts
export async function setupAdminPage(Astro: any) {
  const csrf = generateCsrfToken();
  Astro.response.headers.set('Set-Cookie', csrf.cookie);
  
  const auth = await checkAdminAuth(Astro.request);
  if (!auth.valid) {
    const reason = auth.debug || 'unknown';
    return {
      redirect: `/admin/login?session=expired&reason=${encodeURIComponent(reason)}`,
      csrfToken: null
    };
  }
  
  return { redirect: null, csrfToken: csrf.token };
}
```

**Usage in Pages:**
```astro
---
const { redirect, csrfToken } = await setupAdminPage(Astro);
if (redirect) return Astro.redirect(redirect);
---
```

#### Step 2: Centralize Navigation Config (Day 12)
**Create Shared Config:**
```typescript
// src/lib/admin/nav.ts
export const adminNavItems = [
  { href: '/admin', label: 'Uploads', icon: 'dashboard' },
  { href: '/admin/media', label: 'Media Library', icon: 'media' },
  { href: '/admin/audio', label: 'ICT★SNU SOUND', icon: 'audio' },
  { href: '/admin/works', label: 'Works', icon: 'works' },
  { href: '/admin/products', label: 'Inventory', icon: 'products' },
  { href: '/admin/homepage', label: 'Homepage', icon: 'home' },
];

export const adminIconPaths: Record<string, string> = {
  // All SVG paths
};

export function isNavActive(currentPath: string, href: string): boolean {
  if (href === '/admin') return currentPath === '/admin' || currentPath === '/admin/';
  return currentPath.startsWith(href);
}
```

#### Step 3: Standardize Logout Handler (Day 13)
**Move to Shared Client Library:**
```typescript
// src/lib/admin-client/logout.ts
export function setupLogoutButton(buttonId: string = 'admin-logout-btn') {
  document.getElementById(buttonId)?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to logout?')) return;
    try {
      const res = await fetch('/api/admin/logout', { 
        method: 'POST', 
        credentials: 'include' 
      });
      if (res.ok) window.location.href = '/admin/login?logged_out=1';
      else window.location.href = '/admin/login?session=expired';
    } catch {
      alert('Logout failed');
    }
  });
}
```

---

## Issue Category 4: OVERENGINEERING

### Problem Statement
Complex solutions for simple problems, premature abstractions, and unnecessary indirection.

### Current State Analysis

#### Overengineering Examples:

1. **Works Gallery "Show More" System**
   - Current: CSS-based hidden items + filter toggle system
   - Complexity: High (700 lines of JS to manage)
   - Simpler approach: Pagination or load-more button

2. **Selection Mode State Management**
   - Current: Complex Set-based tracking with visual state sync
   - Lines: ~150 lines of selection-specific code
   - Simpler approach: Native checkboxes with form submission

3. **Bulk Delete Implementation**
   - Current: Parallel promises with individual confirmation
   - Complexity: High (count tracking, UI updates, error handling)
   - Simpler approach: Single batch API endpoint

4. **Slug Auto-Generation**
   - Current: Tracks previous title to detect manual edits
   - Complexity: Medium (comparison logic)
   - Simpler approach: Manual entry with "generate" button

5. **Media Selection Architecture**
   - Current: Custom events, window dispatch, complex state
   - Simpler approach: Callback props or direct handler binding

### Plan of Action: Overengineering

#### Step 1: Simplify "Show More" to Pagination (Day 14)
**Current Approach:**
- Server renders all items with `hidden` class on extras
- JavaScript toggles visibility based on filter
- Complex interaction with "show more" links

**Simplified Approach:**
```typescript
// Server: Load 12 per category
const works = await getWorksForGrid('physical', { limit: 12 });

// Client: "Load More" button fetches next 12
async function loadMore(category: string, offset: number) {
  const res = await fetch(`/api/admin/works?category=${category}&offset=${offset}`);
  const moreWorks = await res.json();
  appendToGallery(moreWorks);
}
```

**UI/UX Preservation:**
- Replace "+N more" button with "Load More" button
- Same visual appearance, simpler behavior
- New items fade in with same animation

#### Step 2: Simplify Selection Mode (Day 15)
**Current:** Complex Set-based state with custom UI  
**Simplified:** Native checkboxes with native form behavior

**Implementation:**
```tsx
// Instead of custom Set-based tracking:
<form id="bulk-actions-form">
  {works.map(work => (
    <div class="work-card">
      <input type="checkbox" name="selectedIds" value={work.id} />
      {/* work content */}
    </div>
  ))}
  <button formmethod="POST" formaction="/api/admin/works/bulk-delete">
    Delete Selected
  </button>
</form>
```

**Benefits:**
- No custom state management
- Native checkbox behavior (keyboard accessible)
- Simpler code, same UX

**UI/UX Preservation:**
- Checkboxes still appear on hover (or always visible in "select mode")
- Selected items still highlighted with blue border
- Bulk actions bar same appearance

#### Step 3: Create Batch API Endpoint (Day 16)
**Current:** Client sends N parallel delete requests  
**Simplified:** Single batch request

**New Endpoint:**
```typescript
// POST /api/admin/works/bulk-delete
const body = await request.json(); // { ids: string[] }
// Single transaction delete
return { deleted: count };
```

**Benefits:**
- Atomic operation (all or nothing)
- Single confirmation dialog
- Faster (one round-trip)

#### Step 4: Simplify Slug Generation (Day 17)
**Current:** Auto-generates on every keystroke, tracks previous title  
**Simplified:** Button to generate from current title

**Implementation:**
```tsx
<div class="relative">
  <input name="slug" id="slug" />
  <button 
    type="button" 
    onclick="document.getElementById('slug').value = slugify(document.getElementById('title').value)"
    class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-400"
  >
    Generate
  </button>
</div>
```

**UI/UX Preservation:**
- User still sees generated slug
- Can manually edit
- Clear control over generation

#### Step 5: Simplify Media Selection (Day 18)
**Current:** Custom events dispatched to window  
**Simplified:** Direct callback or Promise-based

**Implementation:**
```typescript
// Instead of window event:
const selectedMedia = await openMediaSelector({ mediaType: 'image' });
// Returns Promise that resolves when user selects
```

---

## Execution Timeline

### Week 1: Foundation (Days 1-7)
| Day | Task | Output |
|-----|------|--------|
| 1 | Create AdminLayout.astro | Shared layout component |
| 2 | Migrate pages to AdminLayout | 3 updated page files |
| 3 | Extract WorkGallery component | WorkGallery.tsx |
| 4 | Extract WorkEditor component | WorkEditor.tsx |
| 5 | Extract upload components | UploadDropzone, MediaGrid |
| 6 | Extract audio components | AudioPostForm, AudioPostsList |
| 7 | Implement works pagination | API endpoint + client loading |

### Week 2: Standardization (Days 8-14)
| Day | Task | Output |
|-----|------|--------|
| 8 | Move scripts to external files | 4 TS files in lib/admin-client/ |
| 9 | Optimize media loading | Pagination on dashboard |
| 10 | Add resource preloading | Updated Layout.astro |
| 11 | Standardize auth handling | setupAdminPage() helper |
| 12 | Centralize nav config | nav.ts with all items |
| 13 | Standardize logout | logout.ts helper |
| 14 | Simplify "show more" | Load More buttons |

### Week 3: Simplification (Days 15-21)
| Day | Task | Output |
|-----|------|--------|
| 15 | Simplify selection mode | Native checkboxes |
| 16 | Create batch API endpoint | bulk-delete endpoint |
| 17 | Simplify slug generation | Generate button approach |
| 18 | Simplify media selection | Promise-based modal |
| 19 | Test all admin pages | Verification document |
| 20 | Performance audit | Lighthouse scores |
| 21 | Final review & polish | Production ready |

---

## UI/UX Verification Checklist

After each change, verify the following:

### Visual Design
- [ ] Background colors match original (`#0a0a0a`, `#111`, `#1a1a1a`)
- [ ] Text colors correct (`text-white`, `text-gray-400`, `text-gray-500`)
- [ ] Border colors correct (`#333`, `#555` on hover)
- [ ] Button styles preserved (blue primary, red destructive)
- [ ] Form inputs styled correctly (`bg-[#222]`, `border-[#444]`)

### Layout
- [ ] Sidebar fixed at 256px width
- [ ] Main content scrolls independently
- [ ] Container max-width and padding preserved
- [ ] Card spacing and gaps correct

### Navigation
- [ ] All 6 nav items present
- [ ] Icons render correctly
- [ ] Active state highlights correctly
- [ ] Logout button functional
- [ ] View Site link at bottom

### Interactions
- [ ] Cards show edit/delete on hover
- [ ] Selection checkboxes appear in select mode
- [ ] Selected items highlight with blue border
- [ ] Filter buttons highlight active state
- [ ] Modals open/close correctly
- [ ] Form submissions work
- [ ] Cancel/reset clears form

### Animations
- [ ] Card hover scale effect (1.05)
- [ ] Fade transitions on delete
- [ ] Modal backdrop blur
- [ ] New items fade in when loading more

### Responsive
- [ ] Works grid: 2 cols mobile, 3 tablet, 4 desktop
- [ ] Media grid same as works
- [ ] Sidebar stays fixed on desktop
- [ ] Content area scrolls correctly

---

## Risk Mitigation

### High-Risk Changes
1. **Selection Mode Refactor:** Could break bulk operations
   - Mitigation: Test with 1, 5, 10, 50 items
   - Keep old implementation commented until verified

2. **Batch Delete API:** Could cause data loss if buggy
   - Mitigation: Test on staging with backups
   - Add confirmation dialog with item count
   - Soft delete (already implemented) allows recovery

3. **AdminLayout Extraction:** Could break auth flow
   - Mitigation: Test login/logout on all pages
   - Verify CSRF tokens still validate

### Rollback Plan
All changes will be made in feature branches with clear commits:
```
branch: feat/admin-layout
branch: feat/works-components
branch: feat/pagination
...
```

If issues found, revert to `main` and fix in branch.

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| works.astro lines | 1,494 | < 300 |
| index.astro lines | 811 | < 300 |
| audio.astro lines | 582 | < 300 |
| Shared code duplication | 100% | < 20% |
| Lighthouse Performance | TBD | > 80 |
| Admin page load time | TBD | < 2s |

---

## Appendix: UI/UX Reference

### Color Palette (Preserve Exactly)
```
Page Background:     #0a0a0a (bg-[#0a0a0a])
Content Background: #111 (bg-[#111])
Card Background:    #1a1a1a (bg-[#1a1a1a])
Input Background:   #222 (bg-[#222])
Border Default:     #333 (border-[#333])
Border Hover:       #555 (hover:border-[#555])
Primary Action:     #2563eb (bg-blue-600)
Destructive:        #ef4444 (bg-red-500)
```

### Typography (Preserve Exactly)
```
Headings:     text-white, font-semibold
Body:         text-gray-400
Muted:        text-gray-500
Labels:       text-gray-300, text-sm, font-medium
```

### Spacing (Preserve Exactly)
```
Page padding:       p-6 (24px)
Card padding:       p-6 (24px)
Section gaps:       gap-6 (24px)
Grid gaps:          gap-4 (16px)
Button padding:     px-4 py-2
```

### Animation Specs (Preserve Exactly)
```
Card hover scale:   group-hover:scale-105
Fade duration:      300ms (transition-all duration-300)
Modal backdrop:     bg-black/70 backdrop-blur-sm
```

---

*End of Plan of Action*

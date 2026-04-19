# Markdown Library Section Research

Date: 2026-03-20

## Goal

Add a fourth section to the app for Markdown files:

- upload one or many `.md` files
- organize them with tags
- filter by tag
- bulk-select files
- re-download one file, selected files, or a whole tag
- let the user choose a destination directory when supported

## Source Notes

### File upload constraints and patterns

1. MDN: HTML `accept` attribute
   Source: <https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/accept>
   Relevant points:
   - file inputs can restrict picker suggestions with extensions like `.md`
   - `accept` is only a browser hint, not true validation
   - server-side validation is still required

2. MDN: HTML `multiple` attribute
   Source: <https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/multiple>
   Relevant points:
   - file inputs can select one or more files when `multiple` is present
   - users may select multiple files using their platform-native picker behavior
   - accessible instructions matter when multi-select is supported

3. MDN: File drag and drop
   Source: <https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop>
   Relevant points:
   - a drop zone should still be backed by a normal file input
   - drag-and-drop should not be the only import path
   - the label-plus-hidden-input pattern is a clean implementation path

4. MDN: `DataTransfer.files`
   Source: <https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/files>
   Relevant points:
   - dropped desktop files are available from `dataTransfer.files`
   - this is only readable during `drop` and `paste` events

### Download directory and local file writing constraints

5. MDN: `window.showDirectoryPicker()`
   Source: <https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker>
   Relevant points:
   - user activation is required
   - the API returns a `FileSystemDirectoryHandle`
   - this is the right primitive for user-chosen destination folders

6. Chrome for Developers: File System Access API
   Source: <https://developer.chrome.com/docs/capabilities/web-apis/file-system-access>
   Relevant points:
   - File System Access is supported on most Chromium browsers
   - feature detection should be used
   - `showOpenFilePicker()` and `showDirectoryPicker()` must run in a secure context and user gesture
   - directories can be opened with `{ mode: 'readwrite' }`
   - handles can then be used to create writable files
   - this is not a universal cross-browser capability

## Best Features To Add

### Must-have

1. Multi-file Markdown import
   - support picker import with `accept=".md,text/markdown"` and `multiple`
   - support drag-and-drop onto the same area

2. Metadata per file
   - title
   - original filename
   - tags
   - short description or notes
   - created / updated timestamps
   - file size

3. Tag-based grouping
   - filter by one tag
   - bulk actions from the active tag
   - keep tags lightweight instead of nested folders inside the app

4. Bulk selection
   - select multiple files
   - select all visible files
   - clear selection quickly

5. Bulk export
   - export selected files
   - export all files in the active tag
   - export a single file

### Strong additions that fit this app

6. Destination-directory export on supported browsers
   - use `showDirectoryPicker()` and write each Markdown file directly
   - lets the user decide the actual folder destination

7. ZIP fallback export
   - when File System Access is unavailable, download one archive instead
   - avoids broken or inconsistent multi-download behavior

8. Content preview
   - preview raw Markdown
   - show a short excerpt in the list view

9. Filename hygiene
   - preserve original file names when possible
   - sanitize names before export to avoid invalid path characters

10. Search across title, filename, tags, and body
   - important once the library grows beyond a handful of files

## UX Recommendations

1. Keep import obvious
   - use one clear import card with drag-and-drop plus browse fallback

2. Make bulk state visible
   - always show selected count and export actions near the list

3. Separate organization from export
   - tags are for grouping in-app
   - export destination is chosen only at download time

4. Prefer a library + detail layout
   - left/center list for discovery
   - right detail pane for preview and metadata

5. Be honest about browser capability
   - if directory export is not supported, say so and fall back to ZIP

## Scope Chosen For Implementation

The first implementation should include:

- a new Markdown section in the main navigation
- multi-file import
- tag management and filtering
- search
- detail pane with metadata and raw Markdown preview
- bulk selection
- export selected / export active tag
- directory export using File System Access when available
- ZIP fallback export when not available

## Implementation Notes

To keep the architecture clean:

- store Markdown files on disk in a dedicated app folder instead of embedding full content in the main JSON file
- keep metadata in the app data model
- fetch full content only when needed for preview or export
- generate ZIP archives server-side for the fallback path

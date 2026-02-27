# mulle-patternfile-editor Development Plan

## Project Overview

A desktop Electron application for editing mulle-match pattern files in a visual, dual-column interface. The app manages files in `.mulle/etc/match` and `.mulle/share/match` directories.

## Architecture

### File Structure
```
.mulle/
├── etc/match/
│   ├── ignore.d/          # User overrides (higher priority)
│   │   ├── 10-boring--none -> ../../../share/match/ignore.d/10-boring--none
│   │   └── 20-generated--none
│   └── match.d/           # User overrides (higher priority)
└── share/match/
    ├── ignore.d/          # Shared defaults
    │   └── 10-boring--none
    └── match.d/           # Shared defaults
        ├── 10-sourcetree--all
        ├── 65-generated--clib
        ├── 70-header--private-generated-headers
        └── ... (more pattern files)
```

### Key Concepts

1. **Two-tier system**: `share/` contains defaults, `etc/` contains overrides
2. **Active files**: Combination of both directories (etc takes precedence)
3. **Symlinks**: May be used instead of copies on supporting platforms
4. **Two columns**: Left = ignore.d patterns, Right = match.d patterns

## Development Phases

### Phase 1: Basic Window ✅
- [x] Create project structure
- [x] Set up package.json with dependencies
- [x] Create main.js with basic window
- [x] Create empty HTML/CSS layout
- [x] Set up menu with keyboard shortcuts
- [x] Configure GitHub workflows
- [x] Add README and LICENSE

### Phase 2: Project Loading ✅
- [x] Implement directory picker dialog
- [x] Scan `.mulle/etc/match` and `.mulle/share/match`
- [x] Detect symlinks vs regular files
- [x] Build file list for both ignore.d and match.d
- [x] Display project path in UI
- [x] Handle missing directories gracefully
- [x] Validate .mulle folder exists before opening
- [x] Show error dialog if no .mulle folder found

### Phase 3: File Display ✅
- [x] Create file card component for each pattern file
- [x] Show file name and location (etc vs share)
- [x] Indicate if file is symlink
- [x] Display file selector/list in each column
- [x] Sort files by name
- [x] Highlight selected file
- [x] Open multiple editors simultaneously
- [x] Close editors with confirmation if modified
- [x] Show modified indicator (●) in editor header
- [x] File list scrollable, editors take remaining space

### Phase 4: Text Editor Integration ✅
- [x] Create textarea-based editor for each file
- [x] Load file contents when selected
- [ ] Implement syntax highlighting for patterns (optional - skip for now)
- [x] Track modified state (dirty flag)
- [x] Auto-resize editor based on content
- [x] Allow multiple files open simultaneously

### Phase 5: File Management ✅
- [x] Add new file button with modal dialog
- [x] File naming convention: `NN-type--category` format
- [x] Three-field input (priority, type, category) with live preview
- [x] Delete file button (only shown for etc/ files)
- [x] Duplicate filename prevention (checks both etc/ and share/)
- [x] Auto-create symlinks to share/ files when creating first etc/ file
- [x] Scroll to and focus new editor after creation
- [x] Sort editors alphabetically by filename
- [x] Handle symlink deletion (just removes the symlink)

### Phase 6: Smart Save ✅
- [x] Implement "Save All" functionality
- [x] Detect which files need saving (modified flag)
- [x] Handle symlinks correctly:
  - Preserve symlinks when content remains identical to share/
  - Convert files to symlinks when content becomes identical to share/
  - Replace symlinks with real files when content differs from share/
- [x] Handle share/ files: Create in etc/ (as symlink if identical, real file if different)
- [x] Auto-create parent directories if they don't exist
- [x] Delete marked files on save
- [x] Optimize etc/ structure after save (symlink creation/cleanup)
- [x] Remove etc/ directory if all files are symlinks (no unique content)
- [x] Update modified indicators after save
- [x] Show save confirmation
- [x] Reload project after save to reflect new state

### Phase 7: Enhanced UI ✅
- [x] Recent projects list (up to 10, stored in userData)
- [x] Preferences modal with settings
- [x] Show/hide location badges (ETC, SHARE, SYMLINK)
- [x] Environment variable editor (MULLE_MATCH_*)
- [x] Live preview panel showing matched files
- [x] Debounced preview updates (1s delay, 5s max)
- [x] Split view (ignore.d / match.d columns)
- [x] Multiple editors open simultaneously
- [x] Keyboard shortcuts for all main actions
- [ ] Search/filter for files
- [ ] Collapsible/expandable editor panels
- [ ] Drag-and-drop file reordering

### Phase 8: Validation & Testing
- [ ] Validate pattern syntax
- [ ] Test with real mulle projects
- [ ] Test symlink handling on Linux/Mac/Windows
- [ ] Test with missing directories
- [ ] Test with read-only files
- [ ] Error handling and user feedback

### Phase 9: Polish & Release
- [ ] Create proper icon set
- [ ] Add tooltips and help text
- [ ] Improve error messages
- [ ] Add preferences/settings
- [ ] Create user documentation
- [ ] Test builds on all platforms
- [ ] Create release builds

## Technical Decisions

### File Naming Convention
Pattern files follow the format: `NN-type--category`
- **NN**: Two-digit priority (00-99) for sorting order
- **type**: File purpose (e.g., "header", "source", "boring", "generated", "resource")
- **category**: Category name (e.g., "all", "none", "private-headers", "myfiles")
- Examples: `10-boring--none`, `50-resource--whatever`, `85-header--public-headers`

### Symlink Strategy
The editor maintains a smart symlink system:
1. **Default state**: etc/ files that are identical to share/ are stored as symlinks
2. **On edit**: Symlinks are replaced with real files when content differs
3. **On save**: Files that become identical to share/ are converted back to symlinks
4. **First etc/ file**: When creating the first file in etc/match/ignore.d or etc/match/match.d, all share/ files are automatically symlinked into etc/
5. **Cleanup**: If all etc/ files become symlinks (no unique content), the entire etc/ directory is removed

This approach:
- Saves disk space (identical files are symlinks)
- Shows relationship visually (symlink badge)
- Allows deletion of etc/ when user has no customizations
- Makes it clear which files have local overrides

### Save Logic Flow
```
For each modified file:
  1. Determine target path (etc/ for new files, original path for existing)
  2. Check if corresponding share/ file exists
  3. Compare content with share/ version
  4. If identical:
     - Remove any existing file/symlink
     - Create symlink to share/
  5. If different:
     - Remove any existing file/symlink  
     - Write real file with new content
  6. After all saves, optimize etc/ structure:
     - For each file, check if now identical to share/
     - Convert to symlinks where possible
     - Remove etc/ directory if only symlinks remain
```

### Menu & Shortcuts
- **File > Open Project** (Ctrl+O): Open project directory
- **File > Save All** (Ctrl+S): Save all modified files
- **Edit > Add File** (Ctrl+N): Create new pattern file
- **Edit > Delete File** (Ctrl+Backspace): Delete selected file

### File Handling
- Use Node.js `fs.promises` for async file operations
- Detect symlinks with `fs.lstat()` 
- Read file contents with `fs.readFile()`
- Write files with automatic parent directory creation
- Create relative symlinks: `../../../share/match/{subdir}/{filename}`

### UI Components
- Native HTML textarea for editing (auto-sizing by line count)
- CSS Grid for two-column layout
- Flexbox for file lists
- Modal dialogs for confirmations and input forms
- Live filename preview in add file modal
- DELETE button only shown for etc/ files (not share/)
- Modified indicator (●) in editor title
- Location badges (ETC, SHARE, SYMLINK) - toggleable in preferences

### Environment Variables
The editor manages three mulle-match environment variables:
- `MULLE_MATCH_FILENAMES`: File patterns to match
- `MULLE_MATCH_IGNORE_PATH`: Paths to ignore
- `MULLE_MATCH_PATH`: Search paths

Changes are saved via `mulle-env set` and loaded via `mulle-env get`.

## Data Flow

1. User opens project directory
2. App validates `.mulle` folder exists
3. App scans `.mulle/etc/match` and `.mulle/share/match` (both ignore.d and match.d)
4. Build file registry with metadata (name, location, path, isSymlink)
5. Filter files: etc/ overrides share/ for same filename
6. Auto-open all unique files in editor panels
7. Load environment variables from `mulle-env`
8. Initialize live preview with `mulle-match`
9. User edits → mark as modified, schedule preview update
10. User saves → smart save logic applies:
    - Save modified files (create etc/ if needed)
    - Auto-create symlinks to share/ files if this is first etc/ file
    - Compare with share/ versions, convert to symlinks if identical
    - Clean up etc/ directories that only contain symlinks
11. Reload project to show updated state (symlinks, badges, etc.)

## Key Learnings

### Symlink Management
- **Critical**: Always compare content with share/ before writing
- **Never** blindly overwrite symlinks - check content first
- When creating first etc/ file, must symlink ALL share/ files to maintain proper pattern precedence
- Users should never reuse share/ filenames (prevents shadowing)

### Modal Dialogs
- Electron renderer doesn't support `prompt()` - must use custom modals
- Use separate input fields for structured data (priority, type, category)
- Live preview helps users understand the result before committing

### Directory Creation
- Always use `{ recursive: true }` when creating directories
- Check if directories exist before determining if it's the "first file"
- Create parent directories automatically in both `writeFile` and `createSymlink` operations

### File Precedence
The mulle-match system uses this precedence (highest to lowest):
1. Files in `etc/match/{ignore,match}.d/` (user overrides)
2. Files in `share/match/{ignore,match}.d/` (shared defaults)

When both exist with same name, etc/ wins. The editor must maintain this by:
- Only showing one version in UI (etc/ takes precedence)
- Creating new files always in etc/
- Preventing duplicate filenames across both locations

### Visual Indicators

The editor uses **color saturation** to indicate file origins:

| File Origin | Header Color | Description |
|------------|--------------|-------------|
| share/ files | Desaturated gray (#f5f6f7) | Viewing defaults |
| etc/ symlinks | Light blue (#e8f2fc) | Linked to defaults |
| etc/ real files | Saturated blue (#d4e4f7) | Custom overrides |

**Modification indicators:**
- **Bold title** - File has been edited
- **Red pulsing dot (●)** - Unsaved changes
- **Header turns saturated blue** - When editing starts (shows file will become etc/)

### File Deletion & Revert

**Show/Hide Deleted Files** (View menu):
- Deleted files are hidden by default
- Toggle visibility to see files marked for deletion
- Deleted files show with trash icon (🗑️) and red tint
- DELETE button becomes green UNDELETE button
- Files can be restored before saving

**Revert Options** (File menu):
1. **Revert to Saved** (Ctrl+R)
   - Discards all unsaved edits and deletions
   - Reloads project from disk
   
2. **Revert to Defaults** (Ctrl+Shift+R)
   - **Permanently deletes** all etc/match/ directories
   - Only enabled when both etc/ and share/ files exist
   - Two confirmation dialogs (safety feature)
   - Results in using only share/ defaults

### Filename Validation

Pattern files use strict naming: `NN-type--category`

| Component | Rule | Examples | Invalid |
|-----------|------|----------|---------|
| NN | Exactly 2 digits (00-99) | `05`, `10`, `50`, `99` | `5`, `100`, `ab` |
| type | Identifier (a-z, 0-9, _) | `custom`, `header_2` | `my-type`, `my type` |
| category | Identifier (a-z, 0-9, _) | `myfiles`, `stage_2` | `my-files`, `my files` |

**Input Validation:**
- Real-time filtering: Invalid characters stripped immediately
- Auto-padding: Single digit priority (e.g., `5`) becomes `05`
- Visual hints: Gray help text below each field
- HTML5 patterns: Browser-level validation
- Clear error messages: Detailed explanations on validation failure

## Future Enhancements
- Pattern syntax validation with highlighting
- Preview mode (test patterns against files)
- Diff view for etc vs share files
- Undo/redo support
- Auto-save functionality
- Integration with mulle-match CLI tools
- Pattern templates/snippets

## Success Criteria
- Can open any mulle project
- Can edit all pattern files
- Smart save handles symlinks correctly
- Works on Linux, macOS, and Windows
- Intuitive UI that's faster than CLI editing
- No data loss (atomic saves, backups)
- Visual feedback for file origins and modifications
- Strict filename validation prevents errors

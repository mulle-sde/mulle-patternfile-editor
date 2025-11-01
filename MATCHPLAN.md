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

### Phase 5: File Management
- [ ] Add new file button (with naming convention)
- [ ] Delete file button (with confirmation)
- [ ] Rename file functionality
- [ ] Move between share and etc
- [ ] Handle symlink creation/deletion
- [ ] Validate file naming patterns

### Phase 6: Smart Save
- [ ] Implement "Save All" functionality
- [ ] Detect which files need saving
- [ ] Handle symlinks correctly:
  - If file is symlink, ask user if they want to:
    - Keep as symlink (don't save changes)
    - Convert to regular file (save changes)
  - If file is in share/, offer to create override in etc/
- [ ] Atomic file writes (write to temp, then rename)
- [ ] Show save confirmation
- [ ] Update modified indicators

### Phase 7: Enhanced UI
- [ ] Add search/filter for files
- [ ] Collapsible/expandable editor panels
- [ ] Split view vs tabbed view option
- [ ] Keyboard navigation between editors
- [ ] Drag-and-drop file reordering
- [ ] Recent projects list

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

### Menu & Shortcuts
- **File > Open Project** (Ctrl+O): Open project directory
- **File > Save All** (Ctrl+S): Save all modified files
- **Edit > Add File** (Ctrl+N): Create new pattern file
- **Edit > Delete File** (Ctrl+Backspace): Delete selected file

### File Handling
- Use Node.js `fs.promises` for async file operations
- Detect symlinks with `fs.lstat()` 
- Read file contents with `fs.readFile()`
- Write atomically: temp file → rename

### UI Components
- Native HTML textarea for editing
- CSS Grid for two-column layout
- Flexbox for file lists
- Modal dialogs for confirmations

## Data Flow

1. User opens project directory
2. App scans `.mulle/etc/match` and `.mulle/share/match`
3. Build file registry with metadata (location, symlink status)
4. Populate UI with file lists
5. User selects file → load contents into editor
6. User edits → mark as modified
7. User saves → smart save logic applies
8. Update UI state

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

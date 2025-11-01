# mulle-patternfile-editor

🎯 GUI App to edit mulle-match pattern files

A desktop application for visually editing mulle-match pattern files used in mulle-sde projects. This editor provides a dual-column interface for managing ignore patterns and match patterns.

## Features

- Two-column layout for ignore.d and match.d pattern files
- Visual file management (add, delete, edit)
- Smart saving with symlink handling
- Cross-platform support (Linux, macOS, Windows)

## Installation

Download the latest release for your platform from the [Releases](https://github.com/mulle-sde/mulle-patternfile-editor/releases) page.

## Development

```bash
npm install
npm start
```

### Build

```bash
# Build for current platform
npm run build

# Build for specific platforms
npm run build:linux
npm run build:mac
npm run build:win
```

## Usage

1. Open a mulle project directory (containing `.mulle/etc/match` and `.mulle/share/match`)
2. Edit pattern files in either column
3. Save changes with Ctrl+S (Cmd+S on macOS)

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Author

Mulle kybernetiK  
nat@mulle-kybernetik.com  
https://github.com/mulle-sde

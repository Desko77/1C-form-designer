# 1C Form Designer

**Visual designer for 1C:Enterprise managed forms in Visual Studio Code**

[Русский](README.md)

---

## About

1C Form Designer is a VS Code extension for visual editing of 1C:Enterprise managed forms. It works directly with XML files in EDT export format, without requiring a running 1C platform or EDT.

### Key Benefits

- **Cross-platform** — Windows, macOS, Linux (anywhere VS Code runs)
- **Lightweight** — under 25 MB (vs ~2 GB for EDT)
- **Git integration** — native Git workflow support
- **Round-trip** — changes serialize back to XML without data loss
- **Open architecture** — extensibility API (planned)

## Features (v0.1 MVP)

- Open and visually edit `Form.xml` (EDT format)
- Form element tree with drag & drop
- Canvas — visual form representation
- Property inspector for selected elements
- Element palette (Toolbox) — add new elements
- Undo/Redo with operation coalescing
- Three view modes: Design, Structure, Source
- Unknown XML block preservation (Tier 3 preserve)
- External file change tracking

## Architecture

Turborepo-based monorepo with four packages:

```
packages/
├── core-form/          # Core: FormModel, XML parser/serializer,
│                       # Layout Engine, Command Engine
├── shared/             # Shared types: message protocol, layout types
├── webview-ui/         # UI: React + Zustand (tree, canvas, inspector)
└── vscode-extension/   # VS Code extension: Custom Editor Provider
```

**FormModel** is the single source of truth. The UI and extension operate on the model, not on raw XML.

## Requirements

- Node.js >= 18
- npm >= 10
- VS Code >= 1.85

## Quick Start

```bash
# Clone
git clone https://github.com/Desko77/1C-form-designer.git
cd 1c-form-designer

# Install dependencies
npm install

# Build all packages
npm run build
```

### Running in Development Mode

1. Open the `packages/vscode-extension` folder in VS Code
2. Press **F5** — this launches the Extension Development Host
3. In the Development Host, open any `Form.xml` file from the `corpus/forms/` directory

### Building VSIX

```bash
cd packages/vscode-extension
npx @vscode/vsce package --no-dependencies
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build all packages |
| `npm run test` | Run tests |
| `npm run lint` | Lint |
| `npm run typecheck` | Type checking |
| `npm run clean` | Clean build artifacts |

## Supported Elements

Form elements are supported at three tiers:

| Tier | Support Level | Elements |
|------|---------------|----------|
| **Tier 1** — full | Parsing, rendering, editing | UsualGroup, Pages, Page, ColumnGroup, CommandBar, InputField, CheckBox, LabelField, Label, Button, Table |
| **Tier 2** — basic | Parsing, basic rendering | RadioButton, TextBox, Number, Date, Tumbler, Spinner, PictureField, Picture decoration |
| **Tier 3** — preserve | XML preserved as-is | All other element types |

## Tech Stack

- **TypeScript 5** — primary language
- **Turborepo** — monorepo management
- **React 18** + **Zustand** — UI
- **Vite** — WebView bundling
- **esbuild** — extension bundling
- **fast-xml-parser** — XML parsing
- **Vitest** — testing

## Test Form Corpus

The `corpus/forms/` directory contains test 1C XML forms:

```
corpus/forms/
├── simple/    # Simple form (< 50 elements)
├── medium/    # Medium form (50–200 elements)
└── tables/    # Form with tables
```

## Roadmap

- **v0.1 (MVP)** — visual editing, round-trip, EDT format
- **v0.2** — configurator linear format, multi-select, copy/paste, canvas zoom
- **v0.3** — Extensibility API, metadata integration, BSL Language Server

## Contributing

The project is under active development. Issues and pull requests are welcome.

## License

See the LICENSE file in the repository root.

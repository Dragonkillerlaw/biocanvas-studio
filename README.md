# BioCanvas Studio

A small, local-first, open-source scientific illustration workspace. Alpha 0.3.

**Public app:** https://dragonkillerlaw.github.io/biocanvas-studio/

The web interface is hosted on GitHub Pages. No ChatGPT login, OpenAI API,
external font service or remote asset CDN is required. All editor code and
bundled SVGs are served from the same site. Project autosave stays in each
visitor's browser. To move existing work from another domain, save its
`.biocanvas` file there and open that file on this site.

`.github/workflows/pages.yml` tests the app, generates its source-download ZIP,
and deploys `dist/` on pushes to `main`. Repository Settings → Pages must use
GitHub Actions as the publishing source. The MCP server continues to run locally;
GitHub Pages hosts the browser editor.

BioCanvas combines a curated Bioicons library with one vector canvas, scientific workflow templates, and editable SVG/draw.io exports. It is a new editor, not a fork of BioRender or a merger of the draw.io/Inkscape/OpenBioFigure codebases.

## Run locally

Python 3 is sufficient; no frontend package installation or build is required.

```sh
python3 -m http.server 8080 --directory dist
```

Open http://localhost:8080. Modern desktop browsers are recommended. The local server is required for ES modules and asset fetches. Once downloaded, this distribution has no runtime third-party network dependencies.

Run `python3 scripts/package-source.py` to generate the source ZIP used by the
app's source-download link. Generated archives are excluded from Git.

## Current features

- 59 vendored Bioicons SVG assets: the original 32 CC0 assets plus 23 course-related CC0/CC BY assets and 4 methods assets. Bilingual search, course/category filtering, author and source metadata, lazy SVG loading.
- Drag/drop, move, resize, rotate, keyboard nudging, duplicate, reorder, text, and step boxes.
- Directed connectors anchored to elements; drag elements to update connections.
- Undo/redo, browser local autosave, portable `.biocanvas` JSON save/load.
- Two scientific workflow templates and deterministic one-line-per-step layout.
- Sanitized custom SVG import (static vector subset only).
- Editable vector SVG; 2x PNG; draw.io XML; separate asset attribution JSON.
- Native SVG exports retain vector groups for further editing in Inkscape.

## Actual integration boundaries

| Tool | Implemented integration | Not implemented |
| --- | --- | --- |
| Bioicons | Vendored 59 illustrations from Bioicons and Wikimedia Commons, with per-asset metadata | Entire catalog/live search |
| draw.io | Export an uncompressed `.drawio` document with image vertices, text and graph edges | Embedded draw.io editor; draw.io import |
| Inkscape | Static SVG import/export | Embedded desktop editor |
| OpenBioFigure | Upstream link in integrations panel | Code integration and project interchange |

The app does not claim affiliation with these projects. Its source is MIT; third-party art retains its own license. Imported artwork is marked as user-provided with unverified rights.

## Architecture

- `dist/core.js`: scene model, validation, geometry, templates, SVG and draw.io serializers.
- `dist/svg-safety.js`: inert SVG parsing and a static vector allowlist; removes scripts, external resources and active SVG features.
- `dist/app.js`: UI, commands, history, persistence, import/export orchestration.
- `dist/assets/catalog.json`: asset provenance catalog.
- `scripts/vendor-bioicons.py`: repeatable retrieval of the curated asset set.
- `tests/core.test.js`: graph, schema and export tests.
- `dist/agent-api.js`: shared transactional AI operations and revision checks.
- `scripts/agent-cli.mjs`: JSON stdin/stdout interface for local agent workflows.
- `dist/assets/normalized.json`: browser-sanitized vector geometry for dependency-free CLI export.

## AI interface

See `dist/ai-interface.html` for the complete browser/CLI contract. Browser callers
await `window.bioCanvasAI.ready`, then use `search_assets`, `get_scene`,
`apply_operations` and `export_scene`. Every batch requires the revision returned
by `get_scene`, is validated before being written and creates one undo checkpoint.
The exported SVG can also be used as a visual preview. Layout warnings are
approximate; inspect the rendered output.

For a local agent, send one JSON request on stdin:

```sh
node scripts/agent-cli.mjs --scene figure.biocanvas < request.json
```

Example request: `{"method":"search_assets","params":{"query":"拟南芥","module":"transcription"}}`.
Use `{"method":"get_scene"}` before modifications. A nonexistent scene path starts
with an empty scene and is created only after a successful mutation. Export
`biocanvas`, `svg` or `drawio` with `export_scene`; the response includes file
content and attribution. CLI exports support bundled assets; custom SVGs use
the browser sanitizer. Local files and browser state do not synchronize
automatically. The MCP server below uses the same scene model and operations.

## Connect to an AI client with MCP

Node.js 20 or newer is required; there are no npm runtime dependencies. Clone or
download this repository, then register its **stdio** MCP server with Codex:

```sh
codex mcp add biocanvas -- node /absolute/path/to/biocanvas-studio/scripts/mcp-server.mjs --workspace /absolute/path/to/your-figures
```

Use absolute paths (quote paths containing spaces). On Windows, replace `node`
with the full path to `node.exe` if it is not on PATH. Open a new Codex chat after
registration to load the server. Other MCP clients can use
[`mcp-config.example.json`](mcp-config.example.json); replace both placeholder paths.
The server runs locally and has no API key, remote listener or model dependency.

| MCP tool | Purpose |
| --- | --- |
| `biocanvas_search_assets` | Search 59 bundled assets by bilingual query, course module and license |
| `biocanvas_list_projects` | List projects in the configured directory |
| `biocanvas_create_project` | Create an empty project without overwriting files |
| `biocanvas_get_scene` | Read the scene, its revision and layout warnings |
| `biocanvas_apply_operations` | Apply a validated batch against the last read revision |
| `biocanvas_export_scene` | Return SVG, draw.io or `.biocanvas` content with attribution |

Try: “Use BioCanvas to find Arabidopsis assets, create a project named `luc-figure`,
draw a labeled expression diagram, and export an editable SVG with attribution.”
Ask the client to save the returned `content` as a file when needed. The server
itself only writes named `.biocanvas` projects inside `--workspace`. It cannot
execute shell commands. Tool schemas expose the supported operations; the browser
API documentation also gives examples. Imports containing custom SVG require the
browser sanitizer and cannot be exported by the MCP server.

To edit the result visually, run the web app and load the generated `.biocanvas`
file. Download it back into the workspace after visual edits. Browser autosave and
MCP project files do not synchronize automatically. Revision checks and atomic
replacement protect MCP edits; avoid saving over a file from another program
while an MCP write is in progress. A leftover `.lock` file after a forced shutdown
must be removed only after confirming no server is writing that project.

## BIO 251 Fall 2026 collection

The user-provided course manual guided these groups: basic pipetting; bacterial
forward genetics; Arabidopsis transcription regulation; organic anion transport;
spinach photosynthesis/Hill reaction; C. elegans movement and GFP observation.
The manual itself, its figures, procedures and student data are not distributed.
`modules` and `keywords` in the catalog describe illustration use, not experimental
results or proof that a generic icon depicts the exact course species.

Known gaps: Eublaberus posticus, Malpighian tubule anatomy, spinach thylakoids/PSII,
the luminometer, and gene-specific unc/GFP patterns. A German cockroach image was
excluded because it is a different species. The generic leaf and membrane carrier
are explicitly labeled; the Dumpy illustration is not assigned to a specific unc gene.

`scripts/vendor-course.py` reproduces the 23 additions using official upstream
catalog/commit/tree JSON files. It pins the retrieved SVGs to a commit and records
SHA-256 hashes, authors and licenses. After changing SVG inputs, regenerate
`normalized.json` with the browser checker below before using the CLI.

The asset adapter contract is `{id, name, label, category, author, license, licenseUrl, source, svg, viewBox, inner}`. New libraries should expose this contract with per-asset provenance. The portable document schema is versioned and validated in `core.js`. New serializers can consume the scene without replacing the editor.

## Validation

```sh
npm test
```

The 17 tests cover core graph/export behavior, atomic agent operations, stale
revision rejection (including asynchronous conflicts), bilingual course search,
and actual CLI file creation/export. MCP subprocess tests cover initialization,
tool discovery, asset search, project persistence, all exports, revision conflicts,
failed batch rollback, path restrictions, hard links and concurrent write locks.
GitHub Actions runs the suite on Windows and Linux with Node 20 and 22.
A standalone browser check validates all
59 SVGs, lazy loading, filtering, AI edits, undo/redo, reload persistence and SVG
decoding. Run it with an installed Playwright package (Edge is used):

```sh
node scripts/check-browser.cjs /absolute/path/to/playwright /absolute/path/to/qa-output
```

It uses a fresh browser profile and a temporary local server, regenerates
normalized geometry and writes QA screenshots. A draw.io round-trip in its actual
editor remains unverified.

## Limits of this alpha

- Fixed 1000 × 650 canvas. No grouping, multi-select, snapping guides or multipage documents yet.
- Connectors use unrotated element bounds. Very long labels may need manual wrapping.
- Custom SVG import intentionally omits raster images, animation, filters and external resources. Some SVGs therefore render differently; inspect them after import.
- Autosave is browser local, not cloud backup. Download project files to transfer or back up work.
- There is no AI inference, backend, account system or collaboration service.
- Template steps are drawing examples, not validated laboratory protocols.
- The source zip contains the application but no deployment identity or credentials.

## Next milestones

1. Add grouped selection, alignment/distribution, constrained scaling and connector routing.
2. Package a larger curated library with thumbnail indexing and license filters.
3. Add draw.io import and define an OpenBioFigure project adapter against a pinned schema.
4. Add browser regression tests for pointer interactions and export rendering.
5. Expand contribution guidance and publish tagged releases.

## License

MIT for BioCanvas source. See `LICENSE`, `THIRD_PARTY_NOTICES.md` and the per-asset catalog.

## Methods illustration additions

Four reusable SVGs cover a bench microcentrifuge (Andi-Wilson), orbital shaker and monochrome DNA (DBCLS), and a spin column/collection tube (Squidonius, Wikimedia Commons). The latter is public-domain artwork adapted by removing its chemistry inset and cropping to the column. It is a generic illustration, not an exact Promega SV model. Instrument names and exact reagents should remain explicit text where a generic asset would mislead.

Run `python scripts/vendor-methods.py` and the browser checker to reproduce this collection. The catalog records pinned Bioicons revisions, source URLs, authors, licenses, file hashes, and modifications. Student diagrams and course documents are not part of this public collection.

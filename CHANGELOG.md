# Changelog

All notable changes to the "krpano-lang" extension are documented in this file.

## 0.13.0

**预发布版本(pre-release)**:内容与 1.0.0 相同,通过 Marketplace 的 pre-release 通道发布(次版本号为奇数,判定规则见 `Release` workflow),用于在正式版之前验证安装与升级路径。

## 1.0.0

### Added

- **Statements, commands and diagnostics**
  - `xml.format.scriptStatements` (opt-in) splits multiple krpano statements written on one line into separate lines; semicolons inside strings and parentheses are untouched and JavaScript actions are skipped.
  - Command palette: **krpano: Insert Scene Skeleton** (view / preview / multires cube template named after the file) and **krpano: Format All XML Files** (formats the workspace, only rewrites documents whose tag structure is unchanged, reports how many files were skipped). Command titles are localized through `package.nls`.
  - `<include url="...">` can be completed from the XML files next to the document, and `F12` on the url jumps to the included file.
  - Attribute values are validated: unbalanced parentheses or quotes in `calc:`/`get:` expressions are warned about, and enum attributes (`align`, `edge`, `fovtype`, `blendmode`) report values outside the documented set.
  - Hover shows the accepted values for common attributes; `krpano.lsp.diagnostics.unknownAttributes` and `krpano.lsp.diagnostics.versionMismatch` can switch off the two attribute checks.
- **Localization and observability**: the quick-fix titles and the extension-host messages follow the VS Code display language (Chinese/English), the language client logs state transitions to the *krpano-lang* output channel and warns when the server stops unexpectedly (highlighting and formatting keep working).
- **Testing**: a real VS Code integration test (`npm run test:integration`, `@vscode/test-electron`) runs formatting, the commands and the language server end-to-end; CI runs it on Linux under `xvfb`. Branch coverage is now measured without the bundled third-party formatter and the thresholds are 90% lines / 90% branches / 88% functions.
- `npm run typecheck` (`tsc --noEmit`) runs in CI.

### Fixed

- Latent defects found by enabling the type check and by the coverage work: `getHover` had a stray block referencing an undefined `context` (it would throw when hovering `layer[...`), duplicate detection dropped the `container`, the include index lost the defining element, `resolveIncludePath` threw for unsaved documents, rename candidates could collide with existing names, and "Extract attributes to style" rewrote valueless attributes into `name=""`.

### Changed

- The formatter now honours the `tabSize`/`insertSpaces` of the formatting request (matching the behaviour of other language formatters); `xml.format.indentation` still wins when set.
- Minimum VS Code version raised from 1.52 to **1.63**: the Marketplace only supports pre-release versions (needed for `1.0.0-rc.*`) for extensions declaring `engines.vscode >= 1.63`; the extension itself does not use any API newer than that.

## 0.12.0

### Added

- Formatting options: `xml.format.attributeLayout` (`preserve` / `one-per-line` / `align`) rewrites multi-attribute tags in the krpano documentation style, and `xml.format.actionIndentation` re-indents `<action>` bodies by parenthesis depth (opt-in; the script statements themselves are never reordered).
- Quick fixes for refactoring: "Extract attributes to style" (keeps `name`/positioning attributes on the element) and "Extract selection to action" (replaces the selection with a call and inserts a new `<action>`).
- Debugging the language server: `debug` transport now starts the server with `--inspect=6011`, and `.vscode/launch.json` gained an "Attach to Language Server" configuration.
- User-facing messages of the extension host (formatting warnings) follow the display language of VS Code (Chinese/English).
- Marketplace metadata: keywords and README badges.

### Changed

- Documentation: the maintenance notes list what remains open (full server-message localization, a real VS Code integration test) after this round.

## 0.11.0

### Added

- Attribute diagnostics: unknown attributes are reported (information) with a one-click "Change attribute to ..." fix; style-template elements (`style`, `object`, `prototype`) are exempt because they allow custom attributes.
- Version awareness: the generator now diffs the official XML reference of krpano 1.21–1.24 (920 attribute/version records), so attributes introduced after the version declared in `<krpano version="...">` are reported as "needs krpano X.Y or newer" and attributes that disappeared from the documentation as "may be deprecated".
- Signature help for built-in actions: parameter lists are extracted from the official Actions documentation (89 actions, required and optional parameters), shown for the call under the cursor.
- `%N` completion inside actions: placeholders are completed from the declared `args`, with the argument name as detail.
- Attribute completion after element prefixes: `view.fov`, `layer[info].ath`, ... complete the attributes of that element.
- The duplicate-name quick fix now also renames the same-name references inside the same scene (the title states this heuristic).
- Legacy elements `object` and `prototype` are recognised again (they are not in the current XML reference but are valid krpano), so they are no longer flagged as unknown.

## 0.10.1

### Changed

- Publishing: dropped the Open VSX step and instead create a GitHub Release for every version tag, with the release notes taken from this changelog and the packaged `.vsix` attached (`scripts/changelog-notes.mjs` extracts the section).

## 0.10.0

### Fixed

- Major performance fix: converting character offsets to line/column positions was a linear scan per call, which made diagnostics and the outline quadratic on large documents. A prebuilt line index with binary search replaces it (measured on a synthetic 0.91 MB tour: diagnostics 108 s → 0.6 s, outline 50 s → 38 ms, workspace index of 200 files 4.1 s → 0.39 s).

### Added

- Name-argument validation and completion: `loadscene(`, `loadstyle(`, `removehotspot(`, `callwith(caller, ...)` and friends complete the names defined in the file or its includes, and point out names that do not exist.
- `layer[info].` completion: attributes of the referenced element (858 attributes) after an index expression.
- `%N` placeholder validation: placeholders beyond the declared `args` count are reported as information.
- Formatting: `<!-- krpano-lang-format: off -->` … `<!-- krpano-lang-format: on -->` regions are protected verbatim (also when they span several elements).
- Welcome walkthrough with four steps (open, diagnostics, navigation, formatting).
- `npm run bench` performance benchmark (synthetic large tour, with budget assertions) and a benchmark step in CI.
- Engineering: CI matrix across ubuntu/macos/windows, Dependabot, CodeQL analysis, a manual pre-release workflow (`--pre-release`) and an optional Open VSX publishing step (`OVSX_PAT`).

### Notes

- Deliberately not implemented (documented in `docs/development.md`): krpano version awareness (the official documentation has no reliable deprecation data), an attribute-layout formatting option, krpano script re-indentation and LSP message localization.

## 0.9.0

### Added

- References and rename: "Find All References" and F2 rename work across the workspace (definitions and references in included files are updated together). Recognized reference forms: `layer[info]` style indexes, `style="..."` / `linkedscene="..."` values, `action_name(...)` calls and name arguments such as `loadscene(scene1)`.
- Bracket index completion and validation: `layer[`, `hotspot[`, `scene[`, ... complete the names defined in the file or in included files, and indexes pointing to unknown names are reported (dynamic indexes like `layer[get(x)]` are ignored).
- Quick fixes: unknown element → "Change to <closest element>" (open and close tag), `lang="ts"` → `type="Javascript"`, undefined action call → create the `<action>` skeleton, duplicate `name` → rename with a free suffix, missing `<include>` target → create the file.
- Document symbols (Outline) for scenes, actions, hotspots, layers, styles, events, ... and workspace symbols (Ctrl+T) across all XML files of the workspace.
- Diagnostics: indexes that point to unknown names, and an information hint for the unsupported `lang` attribute on actions.

### Changed

- The workspace index (used by references/rename/symbols) is scanned lazily with a 60 s TTL, bounded to 2000 files / 2 MB each, and invalidated on document or file changes.

## 0.8.1

### Fixed

- Documentation: the 0.8.0 release notes named the wrong ESLint major (the lint stack is ESLint 9, not 10).

## 0.8.0

### Added

- Coverage reporting with c8 (95%+ statements / 95%+ functions of the pure logic modules) and thresholds enforced in CI.
- ~105 more hover descriptions (140 documented attributes in total, plus the earlier element docs).
- Incremental include-chain parsing: the index only re-parses files whose version changed (open documents use the editor version, disk files mtime+size).

### Changed

- Lint stack upgraded to ESLint 9 with `@antfu/eslint-config` 9 (flat config); `npm run lint` is part of CI.
- Generated attribute data is cleaned up: krpano API methods that the documentation mixes into the attribute tables are no longer suggested (858 attributes instead of 902).
- The extension icon is a 128×128 PNG and the repository images are excluded from the package (smaller vsix).
- Test builds are written to `test/build` (V8 coverage does not collect files below `test/`).

## 0.7.0

### Added

- Embedded language highlighting: `<data>` bodies (CDATA) are highlighted as JSON and `<style>` entries inside `<cssstyles>` as CSS, next to the existing JavaScript actions.
- `krpano.lsp.*` settings: `diagnostics.enable` (turn diagnostics off), `diagnostics.undefinedActions` (`information` / `warning` / `off`) and `diagnostics.ignoredNames` (names that should not be reported, e.g. plugin-provided actions).
- The built-in action list is now generated from the official Actions documentation as well (145 actions, up from 131).

### Changed

- Diagnostics are debounced (250 ms) and re-read the `krpano.lsp` configuration when it changes.
- New tests: grammar scope snapshot for `sample/*.xml`, documentation consistency (snippet/element counts) and language-server settings.

## 0.6.0

### Added

- More reference diagnostics: duplicate `name` inside the same container (scenes are separate scopes), `linkedscene` pointing to an unknown scene (warning) and `style` pointing to an unknown style (information; skins and plugins may provide it).
- Value completion for `style` / `linkedscene` attributes and for action names inside event attributes (`onclick`, `onloaded`, ...), including names from included files.
- Range formatting (`Format Selection`): re-indents the selected lines to the tag nesting depth, leaving comments and CDATA untouched and skipping selections inside `xml.format.ignoredPaths`.
- Formatting failures now report the parser message instead of a generic warning.
- A `Release` workflow publishes the tagged version to the Marketplace (requires a `VSCE_PAT` repository secret) and verifies that the tag matches `package.json`.

## 0.5.0

### Added

- Language server resolves `<include url="...">` chains: action calls defined in included files are no longer reported as undefined, "go to definition" jumps across files, and an include target that cannot be found is reported as a warning. Included files are watched, so editing e.g. `actions.xml` refreshes the diagnostics of documents that include it.

### Changed

- The published package is now self-contained: `xml-formatter`, `vscode-languageclient` and `vscode-languageserver` are bundled into `dist/` by tsup (23 files, ~520 KB) instead of being shipped in `node_modules` (354 files, ~910 KB). The extension host bundle and the language server bundle are verified to run with no `node_modules` present.

## 0.4.0

### Added

- Language server (LSP):
  - Diagnostics for unclosed/mismatched tags, unknown krpano elements (information), invalid `<action type>` values, and action calls that are not defined in the current file (information).
  - Completion for krpano element names, element attributes (with snippets like `ath="$1"`), the special `devices` / `if` attributes, and the `type` values of `<action>`.
  - Hover with a short description for elements and attributes (31 elements, 900+ attributes taken from the krpano XML reference).
  - Go to definition from `action_name(...)` calls (event attributes and action bodies) to the matching `name="..."` declaration.
- Formatting now asks for confirmation before writing changes when the document contains unclosed or mismatched tags (the formatter silently repairs those).
- Extension settings are declared in the extension manifest (`xml.format.*` now shows up in the Settings UI with descriptions).
- 12 more snippets (include, scene, preview, cube/multires image, view, autorotate, cssstyles, textstyle, action with args, text layer, onclick).
- `npm test` test suite: TextMate scope assertions, formatter unit tests, LSP unit tests an end-to-end language server smoke test over stdio, and a packaged-artifact smoke test that loads `dist/extension.js` with a stub `vscode` API; GitHub Actions CI runs tests and packaging checks.

### Changed

- XML indentation rules for the editor now understand XML tags instead of Ruby-like keywords.
- The `krpano` language mode is explicitly described as "krpano Action Script" (script-only mode; use `krpano-xml` for XML documents).

### Fixed

- The generated vsix was missing the runtime dependency `xml-formatter`, so formatting was broken in published installs (found while packaging 0.3.0).

## 0.3.0

### Added

- JavaScript action highlighting: `<action type="Javascript">` / `type="js"` (case-insensitive) embeds the built-in JavaScript grammar, for both CDATA-wrapped and inline code.

### Fixed

- Single-line `<action>…</action>` bodies are highlighted as krpano script again.
- `{{…}}` interpolations in `<action>` attribute strings are highlighted again.
- Self-closing `<action … />` tags use consistent scope names.
- Formatting: parse failures show a warning instead of failing silently; empty documents are a no-op; `editor.insertSpaces` is honored; the `<?xml?>` declaration is kept at the top when a `<krpano>` root is added; the formatter is registered for both language modes.
- `.xml` files are associated with a single language mode (`krpano-xml`) instead of two.

### Removed

- Invalid `lang="ts"` / `lang="coffee"` action branches (krpano supports neither `lang=` nor TypeScript).

## 0.1.0

- XML formatting support (xml-formatter), formatting options, snippets, block comment and folding configuration.

## 0.0.3

- Initial release: krpano syntax highlighting (TextMate grammars), snippets, language configuration.

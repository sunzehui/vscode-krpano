# Changelog

All notable changes to the "krpano-lang" extension are documented in this file.

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

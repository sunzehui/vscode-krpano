# Changelog

All notable changes to the "krpano-lang" extension are documented in this file.

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

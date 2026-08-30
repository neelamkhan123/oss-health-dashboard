/**
 * Per-language swatch colors, matching what GitHub's own "Languages" bar
 * uses (facebook/react's JavaScript-yellow, Rust-tan, TypeScript-blue —
 * exactly the screenshot this was built from) — so a repo's language bar
 * here reads as the same repo, not a re-skinned one.
 *
 * Sourced from linguist's languages.yml, the file GitHub itself generates
 * those colors from:
 * https://github.com/github-linguist/linguist/blob/main/lib/linguist/languages.yml
 * That file has ~600 entries; this is a curated subset covering the
 * languages actually likely to show up across tracked repos. It's static
 * (linguist's colors rarely change) rather than fetched at runtime — there's
 * no public color endpoint, only that source file.
 *
 * Anything not in this map — a language linguist added after this was
 * written, or an truly obscure one — falls back to a deterministic color
 * hashed from its name via `languageColor()` below, rather than a flat
 * gray: stable across reloads and distinct from its neighbors, just not
 * GitHub's actual value for it. Extend the map itself whenever a specific
 * mismatch is worth fixing.
 */
const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Java: "#b07219",
  Rust: "#dea584",
  Go: "#00ADD8",
  Ruby: "#701516",
  C: "#555555",
  "C++": "#f34b7d",
  "C#": "#178600",
  PHP: "#4F5D95",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Scala: "#c22d40",
  HTML: "#e34c26",
  CSS: "#563d7c",
  SCSS: "#c6538c",
  Shell: "#89e051",
  "Objective-C": "#438eff",
  "Objective-C++": "#6866fb",
  Dart: "#00B4AB",
  Elixir: "#6e4a7e",
  Erlang: "#B83998",
  Clojure: "#db5855",
  Haskell: "#5e5086",
  Lua: "#000080",
  Perl: "#0298c3",
  R: "#198CE7",
  Julia: "#a270ba",
  CoffeeScript: "#244776",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Solidity: "#AA6746",
  Assembly: "#6E4C13",
  PowerShell: "#012456",
  Dockerfile: "#384d54",
  Makefile: "#427819",
  CMake: "#DA3434",
  "Vim Script": "#199f4b",
  "Emacs Lisp": "#c065db",
  Groovy: "#4298b8",
  "F#": "#b845fc",
  OCaml: "#3be133",
  Nim: "#ffc200",
  Zig: "#ec915c",
  V: "#4f87c4",
  Crystal: "#000100",
  D: "#ba595e",
  Fortran: "#4d41b1",
  Pascal: "#E3F171",
  Ada: "#02f88c",
  Prolog: "#74283c",
  Scheme: "#1e4aec",
  "Common Lisp": "#3fb68b",
  Racket: "#3c5caa",
  Elm: "#60B5CC",
  PureScript: "#1D222D",
  ReScript: "#ed5051",
  Nix: "#7e7eff",
  HCL: "#844FBA",
  GraphQL: "#e10098",
  "Jupyter Notebook": "#DA5B0B",
  MATLAB: "#e16737",
  Mathematica: "#dd1100",
  Verilog: "#b2b7f8",
  VHDL: "#adb2cb",
  SQL: "#e38c00",
  PLpgSQL: "#336790",
  TSQL: "#e38c00",
  Batchfile: "#C1F12E",
  Tcl: "#e4cc98",
  Smalltalk: "#596706",
  Handlebars: "#f7931e",
  Jinja: "#a52a22",
  Twig: "#c1d026",
  Markdown: "#083fa1",
  TeX: "#3D6117",
  reStructuredText: "#141414",
  YAML: "#cb171e",
  JSON: "#292929",
  XML: "#0060ac",
  TOML: "#9c4221",
  Protobuf: "#3e5aba",
  WebAssembly: "#04133b",
  Roff: "#ecdebe",
};

/** #rrggbb -> a same-hue color for text on the light "More" side of a chip
 *  etc. Not currently used for text, kept simple: callers just need a hex. */
function hashHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

/** The swatch color for one language name, as GitHub's own linguist would
 *  render it where we have that value, otherwise a deterministic
 *  (not GitHub-accurate) color hashed from the name — see the module doc
 *  above for why a hash beats a flat gray fallback. */
export function languageColor(name: string): string {
  return LANGUAGE_COLORS[name] ?? `hsl(${hashHue(name)}, 55%, 55%)`;
}

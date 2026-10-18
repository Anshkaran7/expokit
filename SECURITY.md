# Security

## Reporting a vulnerability

Please don't report security problems in public issues.

Report them privately with GitHub's [Report a vulnerability](https://github.com/Anshkaran7/expokit/security/advisories/new)
form, or email work@karandev.in (or use https://expokit.karandev.in/support) with "Security" in the subject — what you found, how to
reproduce it and what it affects (a component, the CLI, `expo-kit login` / tokens, or the website). You'll get a reply
within a few days, and a fix and credit (if you'd like it) once it is released.

## Supported versions

The latest published version of `@expokit/cli` and `expo-charts`, and the components in `registry/` on `main`.

## How releases are made

- `@expokit/cli` and `expo-charts` are published to npm by the maintainer, from the code on `main` in this repository.
- Both packages have no runtime dependencies and no install scripts.
- Every change runs CI, [CodeQL](.github/workflows/codeql.yml) and
  [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/Anshkaran7/expokit). GitHub Actions are pinned to
  commit SHAs and run with read-only tokens unless a job needs more.

## What the CLI does on your machine

- Writes only inside your app: `components.json`, the `@/*` alias in `tsconfig.json`, `"main"` in `package.json` and
  the component files under the folders in `components.json`. `--dry-run` shows every change first, and `add` never
  overwrites a file you changed unless you pass `--force`.
- Free components are bundled in the npm package — adding them needs no network.
- Pro components are downloaded over HTTPS from https://expokit.karandev.in. Your token is saved in
  `~/.expo-kit/credentials.json` (readable only by you), is sent only to the site it was created for, and never
  follows a redirect. `expo-kit logout` deletes it.
- Runs one command: `npx expo install <packages>` for the npm packages a component needs.
- `expo-kit mcp` reads the bundled registry only; it never uses the network or your token.
- No telemetry.

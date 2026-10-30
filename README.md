# KB MC Launcher

A custom Minecraft modpack launcher built with **Tauri v2**, a **Rust** backend and a **React + TypeScript** frontend. Created by [JonayKB](https://github.com/JonayKB) for the MCKBServers community.

## Features

- **Accounts** – Microsoft login in the browser (OAuth2 with PKCE → Xbox Live → XSTS → Minecraft Services), including player skin/head extraction, or offline accounts that need no Microsoft account.
- **Full Minecraft Installer** – Downloads and runs vanilla Minecraft and modded loaders:
  - Vanilla
  - Forge
  - NeoForge
  - Fabric
- **Parallel asset & library downloading** for fast installs, with real-time progress reporting to the UI. Large files resume after a dropped connection.
- **Safe updates** – New mods and overrides are prepared aside and only replace the installed ones once everything is ready, so a failed or cancelled update leaves the modpack playable.
- **Automatic Java installation** – The version each Minecraft asks for in its Mojang metadata (8, 17, 21, 25...) is downloaded from Eclipse Temurin and checked against its SHA-256.
- **Encrypted session storage** – Microsoft and Minecraft tokens are stored in an encrypted file whose key lives in the system keyring.
- **JVM auto-tuning** – memory allocation and JVM flags calculated automatically based on the system's available RAM/hardware.
- **Modpack management** – install, configure, and launch modpacks from a modpack detail screen, with per-modpack settings.
- **Polished desktop UI**:
  - Collapsible sidebar navigation
  - Installation progress overlays
  - App and modpack settings modals
  - Discord community integration card
  - First-run onboarding/setup screen
  - Update checker screen with the built-in Tauri updater
- **System tray integration** and native desktop packaging for Windows/Linux.

## Tech Stack

**Frontend**
- React 19 + TypeScript
- React Router
- Vite

**Backend / Native**
- Rust + Tauri v2
- Tokio (async runtime)
- Reqwest (HTTP client) + Axum (local OAuth callback server)
- Serde / serde_json
- `zip` for archive extraction
- `image` for skin/icon processing
- `oauth2` crate for the Microsoft auth flow
- `keyring` + `aes-gcm` for token storage

## Project Structure

```
KB_MC_LAUNCHER/
├── src/                     # React frontend
│   ├── components/          # Reusable UI components (navbar, modals, dropdowns...)
│   ├── screens/             # App screens (Home, Setup, Modpack Detail, Update Checker...)
│   ├── context/             # React context providers
│   ├── hooks/                # Custom hooks
│   ├── repositories/         # Data access layer
│   ├── styles/               # `*Styles.ts` style modules (React.CSSProperties)
│   └── types/                 # Shared TypeScript types
├── src-tauri/                # Rust backend
│   ├── src/
│   │   ├── auth/              # Microsoft, Xbox, Minecraft auth + skin extraction
│   │   ├── installer/          # Download, extraction, requirements, sysinfo
│   │   │   └── loaders/          # Vanilla, Forge, NeoForge, Fabric installers
│   │   ├── launcher.rs           # Game launch logic
│   │   ├── secrets.rs            # Encrypted token storage
│   │   ├── e2e_tests.rs          # Real install-and-play tests
│   │   └── commands.rs            # Tauri commands exposed to the frontend
│   └── tauri.conf.json
├── .github/workflows/         # CI/CD (automated release pipeline)
└── justfile                   # Dev task shortcuts
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [Rust](https://www.rust-lang.org/tools/install) + Cargo
- [Tauri v2 system dependencies](https://v2.tauri.app/start/prerequisites/) for your OS

### Installation

```bash
npm install
```

### Development

```bash
npm run tauri dev
# or, using the justfile:
just dev
```

### Build

```bash
npm run build
npm run tauri build
# or
just package
```

### Tests

```bash
npm run type-check
cd src-tauri && cargo test --lib
```

The real tests install each Minecraft/loader combination from Mojang, Fabric, Forge and NeoForge and start the game with the same command a player gets. They need network access, several GB of disk and an X server (`Xvfb` works):

```bash
cd src-tauri
KB_E2E_DIR=/path/with/space DISPLAY=:99 cargo test --lib e2e -- --ignored --nocapture --test-threads=1
```

`KB_E2E_CASES=vanilla-26.3,forge-1.20.1` limits the run to those cases.

## Modpack format

Supported versions: Minecraft 1.12.2 and later (including the `26.x` numbering). On Linux, versions before 1.13 need `xrandr` installed.

Each modpack publishes a `latest.json` at `https://me.jonaykb.com/modpacks/<id>/latest.json`:

```json
{
  "id": "mypack-1.2.0",
  "modpackId": "mypack",
  "version": "1.2.0",
  "minecraftVersion": "1.20.1",
  "loader": "fabric",
  "loaderVersion": "0.16.10",
  "modsUrl": "https://.../mods.zip",
  "overridesUrl": "https://.../overrides.zip",
  "changelog": "Optional text shown on the home screen",
  "images": ["https://.../screenshot.png"]
}
```

The modpack list lives in `index.json`. An entry can set `release_date` (ISO 8601 with time and zone) to announce a modpack before it can be downloaded: until then its icon is shown greyed out with the release date and a countdown, and installing is disabled. Entries without `release_date` are available right away.

```json
{
  "modpacks": [
    {
      "id": "mypack",
      "name": "My Pack",
      "description": "Short description",
      "imageUrl": "https://.../icon.png",
      "release_date": "2026-11-15T18:00:00+01:00"
    }
  ]
}
```

This check runs on the player's clock, so it is a display gate only: don't upload the mods/overrides files until the release date if they must stay private.

`loader` can be `forge` (default), `neoforge`, `fabric` or `vanilla`. `loaderVersion` is required except for `vanilla`. Older files that only set `forgeVersion` keep working as Forge.

When `version` changes, installed players get an **Update** button. Updating downloads both files first, then replaces the whole `mods/` folder and copies the overrides over the instance. It does not change Minecraft or the loader: a new `minecraftVersion` or `loaderVersion` needs a reinstall.

## Releases

Releases are automated through GitHub Actions (`.github/workflows/release.yml`): pushes to `main` read the version from `src-tauri/tauri.conf.json`, tag the commit, and build/publish installers automatically.

## License

This project is licensed under the [MIT License](LICENSE).

## Privacy

See [PRIVACY.md](PRIVACY.md) for details on what data the launcher collects and how it's used.
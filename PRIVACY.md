# KB MC Launcher Privacy Policy

Last updated: October 2026

KB MC Launcher respects the privacy of its users.

## Information We Collect

KB MC Launcher may store the following information locally on the user's device:

* Minecraft username and UUID
* Player skin head image
* Microsoft refresh tokens and Minecraft access tokens
* Launcher settings and preferences
* Installed modpack information and playtime history
* Launcher logs (kept for 7 days)

## Microsoft Authentication

When signing in with a Microsoft account, authentication is performed through Microsoft's official authentication services.

KB MC Launcher does not collect, store, or have access to Microsoft account passwords. Signing in happens in the user's own browser.

A Microsoft account is optional: offline accounts only store a chosen username on the device.

Authentication tokens are used only to authenticate the user with Microsoft, Xbox Live, and Minecraft services.

## Data Storage

All launcher data is stored locally on the user's computer. No analytics or telemetry are collected.

Authentication tokens are stored in a file encrypted with AES-256-GCM, whose key is kept in the operating system's credential store (Windows Credential Manager, or the Secret Service on Linux). If that store is not available, tokens remain in the launcher's local application storage, without encryption, so that the user stays signed in.

KB MC Launcher does not operate a central user database and does not sell, share, or distribute user information to third parties.

## Third-Party Services

KB MC Launcher communicates with:

* Microsoft Authentication Services, Xbox Live Services and Minecraft Services, to sign in
* Mojang servers, to download Minecraft, its libraries and assets
* Forge, NeoForge and Fabric servers, to download mod loaders
* Eclipse Adoptium and GitHub, to download Java
* me.jonaykb.com, operated by the author, for the modpack list, modpack files and launcher updates
* Discord, to show the community server card
* The image hosts referenced by each modpack

These services receive the user's IP address and the requests needed to provide each download, as with any internet connection. Only the Microsoft, Xbox and Minecraft services receive authentication tokens. The third-party services are governed by their own privacy policies and terms of use.

## Data Security

Reasonable efforts are made to protect locally stored authentication data. Minecraft receives its access token when the game starts, as with any launcher. Users are responsible for securing their own devices and accounts.

## Contact

For questions regarding this Privacy Policy, contact:

[jonaykb@gmail.com](mailto:jonaykb@gmail.com)

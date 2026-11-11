### Continuous integration and releases

Two GitHub Actions workflows live in `.github/workflows/`:

- **Check** runs on every push to `main` and every pull request: typecheck, frontend build and Rust tests.
- **Release** runs when a version tag is pushed. It builds the `.deb`, `.rpm` and AppImage on Ubuntu 24.04, so they work on Debian 13, Ubuntu 24.04 and newer (packages only run on systems with the build machine's glibc or newer), and attaches them to a **draft** release to review and publish by hand.

To release a new version, set it in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, commit, then tag and push:

```bash
git tag -a v1.2.0 -m "Phanes 1.2.0" && git push origin main v1.2.0
```

The workflow refuses a tag that doesn't match the version in `package.json`. It can also be started by hand from the Actions tab to rebuild an existing tag; if that tag already has a release, the release is left unchanged and the packages are attached to the run instead.

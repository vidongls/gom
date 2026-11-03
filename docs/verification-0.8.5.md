# Biên bản phát hành Gom 0.8.5

## Kiểm tra mã nguồn

- `npm run typecheck`: thành công trên Node.js 25.4.0.
- `npm test`: 320/320 test thành công trên Node.js 25.4.0.
- `npm run build`: thành công.
- `node scripts/shelf-ui-check.mjs`: thành công với CRUD, tìm kiếm, clipboard, focus, privacy reset, light/dark, layout responsive và idle mutation.
- `node scripts/verify-release-package.mjs out-release/Gom-darwin-arm64/Gom.app/Contents/Resources/app.asar`: 23 runtime files hợp lệ.

## macOS Apple Silicon

- `npm run make`: tạo DMG/ZIP arm64.
- `codesign --verify --deep --strict`: thành công.
- `hdiutil verify`: DMG hợp lệ.
- `unzip -t`: ZIP không có lỗi.
- SHA-256:
  - DMG: `dffbdb3b6b6e41508d9de9d36c3f70b43c40bf44cfc4ce6da6b0eee06a5cfcd2`
  - ZIP: `7bd8e64327578b2f5cbda90163f3eea78259a9fc3281eb01ec488e83bb80be5e`

## Windows x64

- Workflow Windows release: chờ chạy trên tag `v0.8.5`.
- Setup, gói `.nupkg`, `RELEASES` và checksum: chờ tạo, kiểm tra và tải lên draft.

## GitHub Release

- Repository: `vidongls/gom`.
- Tag: `v0.8.5`.
- Draft: chờ tạo sau khi release commit được hợp nhất.
- Windows workflow và checksum: chờ chạy trên runner Windows.
- Phát hành công khai: chờ đủ asset Mac/Windows và checksum.

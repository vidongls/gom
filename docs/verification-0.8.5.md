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

- Workflow Windows release không khởi động runner vì tài khoản GitHub bị khóa do billing. Không có asset Windows 0.8.5.
- Windows tiếp tục dùng bộ cài 0.8.3 trên `mhfed/gom`.

## GitHub Release

- Repository: `vidongls/gom`.
- Tag: `v0.8.5`.
- Release công khai cho macOS; DMG, ZIP và checksum đã tải lên và SHA-256 trên GitHub khớp với bản cục bộ.
- Windows 0.8.5 chưa được phát hành; ghi chú release dẫn tới bộ cài 0.8.3.

# Mẫu trả lời trong Khay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add encrypted, reusable text templates to the existing Gom shelf so users can find, manage, and copy frequent replies.

**Architecture:** Extend the encrypted shelf index with a separately validated template collection and a backward-compatible migration from version 1. Route template CRUD and explicit copy requests through the existing privacy-guarded ShelfService and render a second accessible tab inside the current shelf panel.

**Tech Stack:** TypeScript, Electron, Node test runner, existing Playwright renderer fixture.

**Spec:** `docs/superpowers/specs/2026-11-03-reply-templates-design.md`

## Global Constraints

- “Mẫu được lưu trên máy qua lần mở lại, dùng kho mã hóa hiện có của Khay và tách giữa Không gian thường/Kín.”
- “Gom chỉ ghi mẫu vào clipboard sau thao tác bấm rõ ràng và báo trạng thái thành công. Người dùng tự chọn cuộc trò chuyện, dán, kiểm tra và gửi.”
- “Không đọc nội dung chat, theo dõi clipboard, tự chèn vào ô soạn, tự gửi tin, đồng bộ qua mạng, mẫu có biến, nhóm/tag, hay tìm mẫu bằng command palette.”
- “Khi khóa hoặc đổi không gian, nội dung kín phải được gỡ khỏi giao diện và callback cũ không được trả mẫu của không gian trước.”
- “Giao diện theo kiểu, màu và trạng thái rỗng của Khay hiện tại; mở/đóng hoặc đổi mục không tải lại trang chat và không làm mất bản nháp.”
- Do not add dependencies or include templates in configuration backups or logs.

## Review Focus

- Existing version-1 shelf data must remain readable and intact after template support is added. Pin this with a migration test in Task 1.
- Invalid, empty, oversized, or control-character template fields must not corrupt or evict existing entries. Pin this in Task 1.
- A copy queued before service execution but invalidated by lock or space switch must neither write to the clipboard nor return prior-space data. Pin this in Task 2.
- A missing or cross-namespace template ID must not reveal its title/body or change clipboard contents. Pin this in Task 2.
- Renderer must keep hostile template strings inert, clear private content on lock, and preserve keyboard focus through redraw. Pin these cases in Task 3.

---

## Files and Responsibilities

- `src/shelf-types.ts` — template model, request actions, snapshot type, and fixed limits.
- `src/main/shelf-store.ts` — encrypted index validation, v1-to-v2 compatibility, and guarded template mutations.
- `src/main/shelf-service.ts` — strict request validation, privacy-epoch checks, and explicit template clipboard writes.
- `src/main/main.ts` — connect the service's text-only clipboard writer to Electron's clipboard API.
- `src/renderer/index.html` — add accessible Nội dung/Mẫu tabs and the title/body editor.
- `src/renderer/shelf.ts` — tab state, search, CRUD actions, copy feedback, safe rendering, and lock cleanup.
- `src/renderer/shell.css` — style template list/editor using the existing shelf tokens and responsive panel.
- `src/renderer/shell.ts` and `src/renderer/workspace-presets.ts` — guard two same-value `hidden` assignments that fail the existing full-shell idle mutation check.
- `tests/shelf-store.test.ts` — persistence, migration, validation, namespace isolation, and stale mutation coverage.
- `tests/shelf-service.test.ts` — strict CRUD/copy request handling, wrong-space IDs, and lock races.
- `scripts/shelf-ui-check.mjs` — browser fixture for tab, editor, search, copy, empty/error states, focus, and lock cleanup.
- `scripts/shelf-check.mjs` — native-view acceptance fixture for preserving the open page and draft while switching to Mẫu.
- `docs/transfer-shelf.md` — add end-user instructions for managing and using templates.

## Task 1: Add encrypted template records to ShelfStore

**Files:**
- Modify: `src/shelf-types.ts`
- Modify: `src/main/shelf-store.ts`
- Test: `tests/shelf-store.test.ts`
- Modify: `tests/shelf-service.test.ts` (add `templates: []` to its snapshot fixture so the new required snapshot field remains type-correct; Task 2 adds service behavior coverage)

**Interfaces:**
- Produce `ShelfTemplate { id: string; title: string; body: string; createdAt: number; updatedAt: number }`.
- Extend `ShelfSnapshot` with `templates: ShelfTemplate[]`; return defensive copies ordered by `updatedAt` descending.
- Add `SHELF_LIMITS.templates = 100` and `templateTitleChars = 120`; use the existing `SHELF_LIMITS.textBytes` limit for each body.
- Produce `addTemplate(space, {title, body}, valid?)`, `updateTemplate(space, id, {title, body}, valid?)`, and `removeTemplate(space, id, valid?)`, each returning the existing `ShelfResult` and using the shelf mutation queue.
- Persist version-2 indexes with both `items` and `templates`. Accept version-1 indexes as `templates: []`; the next successful mutation writes version 2. Keep encrypted atomic replacement and preserve all existing item/blob behavior.
- Normalize CRLF/lone CR to LF in template bodies, preserve tabs/spaces, trim titles, reject blank titles/bodies, unsafe controls, title length above 120 Unicode code points, body above 64 KiB UTF-8, or more than 100 templates in one namespace.

- [x] **Step 1: Add failing tests for template CRUD, namespace isolation, and field limits**

  In `tests/shelf-store.test.ts`, assert create/update/remove return the expected snapshots; body text, line endings, and Unicode survive restart; normal/private templates remain separate; ciphertext files do not contain titles or bodies in clear text; IDs cannot mutate the other namespace; title/body validation and count limits reject without removing prior data; a full set of maximum-size JSON-escaped templates survives restart; and a false `valid` guard prevents queued mutations from committing.

  Add `templates: []` to the existing snapshot returned by the `tests/shelf-service.test.ts` fixture so requiring `ShelfSnapshot.templates` does not break project typechecking before Task 2 extends that fixture.

- [x] **Step 2: Run the focused store tests and confirm the new cases fail**

  Run: `node --test --experimental-strip-types tests/shelf-store.test.ts`

  Expected: existing shelf cases pass and each new template case fails because the template API/schema is absent.

- [x] **Step 3: Implement template types and version-2 encrypted index support**

  Update `ShelfStore` state and validation, accept v1 indexes without changing their item data, include bounded template JSON in the maximum encrypted-index size, and add guarded add/update/remove methods. Keep templates in the same namespace index and encryption boundary as the existing shelf.

- [x] **Step 4: Run the focused store tests and confirm they pass**

  Run: `node --test --experimental-strip-types tests/shelf-store.test.ts`

  Run: `npm run typecheck`

  Expected: all store tests pass, including v1 compatibility, template isolation, and existing item/blob persistence; project typechecking passes with the service fixture's empty template collection.

- [x] **Step 5: Commit the store change**

  ```bash
  git add src/shelf-types.ts src/main/shelf-store.ts tests/shelf-store.test.ts tests/shelf-service.test.ts
  git commit -m "feat: persist encrypted reply templates"
  ```

## Task 2: Add guarded template CRUD and explicit copy requests

**Files:**
- Modify: `src/shelf-types.ts`
- Modify: `src/main/shelf-service.ts`
- Modify: `src/main/main.ts`
- Test: `tests/shelf-service.test.ts`

**Interfaces:**
- Extend `ShelfRequest.action` with `add-template`, `update-template`, `remove-template`, and `copy-template`; add optional `templateId`, `title`, and `body` fields.
- Extend `ShelfEnvironment` with `writeText(text: string): Promise<void>`; implement it with Electron's async `clipboard.writeText` in `src/main/main.ts`. Check the captured namespace/epoch immediately before calling it and again before responding. An already-started explicit copy cannot be canceled after it leaves Gom, matching the existing Khay clipboard boundary.
- `list` returns the store snapshot containing `items` and `templates`. A template copy request uses `templateId`, checks the current namespace and epoch, and writes only that stored body's text after an explicit renderer request.

- [x] **Step 1: Add failing service tests for strict template requests and explicit copy**

  In `tests/shelf-service.test.ts`, extend the fixture snapshot with `templates` and cover successful add/edit/remove/list in one namespace; malformed/unknown keys; missing and cross-namespace IDs; copy calls `writeText` once with exact body text and does not read clipboard; and a copy queued before the service runs but invalidated by an epoch change returns stale without calling `writeText` or exposing prior-space data.

- [x] **Step 2: Run the focused service tests and confirm the new cases fail**

  Run: `node --test --experimental-strip-types tests/shelf-service.test.ts`

  Expected: existing shelf service cases pass and the new template cases fail because the request actions and writer are absent.

- [x] **Step 3: Implement strict request routing and guarded copy**

  Add allowed request keys and actions, route CRUD through the matching `ShelfStore` methods, call `onChange` after successful mutation, and route `copy-template` through the existing serialized clipboard queue. Recheck the privacy context/epoch immediately before looking up or writing template text. Do not route template text through item IDs or page IPC.

- [x] **Step 4: Run the focused service tests and confirm they pass**

  Run: `node --test --experimental-strip-types tests/shelf-service.test.ts`

  Expected: all service tests pass, including prior clipboard, file, and stale-space cases.

- [x] **Step 5: Commit the service change**

  ```bash
  git add src/shelf-types.ts src/main/shelf-service.ts src/main/main.ts tests/shelf-service.test.ts
  git commit -m "feat: guard reply template actions"
  ```

## Task 3: Add the Mẫu tab and editor to the shelf panel

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/shelf.ts`
- Modify: `src/renderer/shell.css`
- Modify: `src/renderer/shell.ts`
- Modify: `src/renderer/workspace-presets.ts`
- Modify: `scripts/shelf-ui-check.mjs`
- Modify: `scripts/shelf-check.mjs`

**Interfaces:**
- Consume `ShelfSnapshot.templates` and the four template request actions from Tasks 1–2.
- Produce two `aria-selected` shelf tabs, **Nội dung** and **Mẫu**. Open Khay on **Nội dung** by default and return to it when the panel is closed or reset, preserving today's default surface. The Mẫu list shows title and body preview with **Sao chép**, **Sửa**, and **Xóa** controls; **Tạo mẫu** opens an in-panel title/body editor with save/cancel.
- Reuse the shelf search input to match template title/body case-insensitively with Vietnamese locale; hide item-only filters, clipboard/file add controls, quota, and capacity while Mẫu is selected. Keep existing item UI behavior unchanged in Nội dung.
- Render titles/bodies with `textContent`; on lock/space change clear template snapshots and editor values. Copy uses `copy-template` only when the user presses the button and reports the service result through the existing live status.

- [x] **Step 1: Extend the renderer fixture with sample templates and failing UI assertions**

  In `scripts/shelf-ui-check.mjs`, add fixture templates and request handling, then assert tab selection, title/body search, empty state, add/edit/delete requests, exact copy action, hostile text remaining inert, and template/editor removal after a simulated lock. Keep the existing zero-mutation idle snapshot and item copy/export tests.

- [x] **Step 2: Run the renderer fixture and confirm the new assertions fail**

  Run: `node scripts/shelf-ui-check.mjs`

  Expected: existing shelf checks pass; new assertions fail because the Mẫu tab and editor are absent.

- [x] **Step 3: Add accessible tabs and template editor markup**

  Add tab buttons and the hidden template editor/list controls inside `#shelf-panel`; preserve a single search input and the existing screen-reader status. Add no new window or modal.

- [x] **Step 4: Implement renderer template state and actions**

  Add tab/editor state to `createShelfUI`; draw template rows with safe text nodes; submit validated fields through add/update requests; remove via explicit X action; copy via `copy-template`; handle empty/search results; restore focus after redraw; and scrub all template state in `reset()`.

- [x] **Step 5: Style the Mẫu list/editor and run the renderer fixture**

  Add `.shelf-*` styles in `src/renderer/shell.css` using existing color tokens and panel widths. Run `node scripts/shelf-ui-check.mjs`.

  Expected: existing and new fixture cases pass without page errors; unchanged snapshots still cause zero idle DOM mutations.

- [x] **Step 6: Extend native-view acceptance coverage for switching to Mẫu**

  In the `native width reservation, drawer and tab switches preserve documents and drafts` group in `scripts/shelf-check.mjs`, set a provider draft, open Khay, select Mẫu, and return to Nội dung. Assert the provider view ID, document token, and draft are unchanged throughout; assert the provider page still has no shelf bridge.

- [x] **Step 7: Remove the existing same-value hidden mutations**

  In `src/renderer/shell.ts`, do not set `#global-action-feedback.hidden = true` when it is already true. In `src/renderer/workspace-presets.ts`, do not assign `#workspace-profile-delete.hidden` when it already equals the desired value. Keep the full-shell `idleMutationCount` assertion in `scripts/shelf-ui-check.mjs`; it must report zero after these equality guards.

- [x] **Step 8: Commit the UI change**

  ```bash
  git add src/renderer/index.html src/renderer/shelf.ts src/renderer/shell.css src/renderer/shell.ts src/renderer/workspace-presets.ts scripts/shelf-ui-check.mjs scripts/shelf-check.mjs
  git commit -m "feat: add reply templates to shelf"
  ```

## Task 4: Document template usage and perform final static checks

**Files:**
- Modify: `docs/transfer-shelf.md`
- Commit: `docs/superpowers/specs/2026-11-03-reply-templates-design.md`, `docs/superpowers/plans/2026-11-03-reply-templates.md`
- Verify: implementation files from Tasks 1–3

- [x] **Step 1: Update the Khay guide**

  Add instructions to create/edit/delete/search a template, copy it, and manually paste/review/send it. State that templates remain local, are separated between normal/private spaces, and are never inserted or sent automatically. Do not change release/version claims.

- [x] **Step 2: Run final verification commands**

  Run: `npm run typecheck`

  Run: `node --test --experimental-strip-types tests/shelf-store.test.ts tests/shelf-service.test.ts`

  Run: `node scripts/shelf-ui-check.mjs`

  Run: `npm run build && node scripts/shelf-check.mjs`

  Expected: typecheck passes; store/service/renderer checks pass; the isolated Electron fixture preserves provider documents and drafts while Mẫu is open.

- [x] **Step 3: Review the diff against the approved design**

  Confirm no provider DOM integration, automatic clipboard read, auto-fill/send, network sync, configuration-backup export, dependency change, or unrelated shelf behavior change was added.

- [x] **Step 4: Commit the guide and final documentation**

  ```bash
  git add docs/transfer-shelf.md docs/superpowers/specs/2026-11-03-reply-templates-design.md docs/superpowers/plans/2026-11-03-reply-templates.md
  git commit -m "docs: document reply templates in shelf"
  ```

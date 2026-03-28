# Repository Guidelines

## Project Goal
This project aims to build a mobile app that lets users photograph books and receive personalized recommendations based on their Goodreads reading history. The first product milestone is image intake: users must be able to take a picture in the app or choose one from their photo library, upload it, and send it for processing so the system can identify books on a shelf.

Contributors should optimize for three core capabilities:
- reliable image capture and upload from mobile devices
- accurate book detection from shelf photos
- Goodreads-linked recommendation logic and a mobile-first user experience

## Project Structure & Module Organization
This repository is currently minimal. The root contains [README.md](C:\Users\gregl\Documents\book-store\README.md) and git metadata only. Keep top-level files limited to project documentation and configuration.

When adding application code, use a predictable layout:
- `src/` for shared runtime code
- `mobile/` for the mobile client
- `services/` for backend APIs, recommendation logic, or Goodreads integration
- `tests/` for automated tests
- `assets/` for static files such as images, sample book covers, or fixtures

Group modules by feature rather than by file type when the codebase grows. Example: `mobile/camera/`, `mobile/photo-library/`, `services/image-processing/`, `services/recommendations/`, `services/goodreads/`.

## Build, Test, and Development Commands
No build or test tooling is configured yet. Add scripts alongside the first implementation and document them in [README.md](C:\Users\gregl\Documents\book-store\README.md).

Until tooling exists, the main contributor commands are:
- `git status` to review local changes
- `git diff` to inspect edits before committing
- `git log --oneline` to review recent history

If you introduce a package manager or framework, also add standard local commands such as `npm test`, `npm run dev`, or equivalent.

## Coding Style & Naming Conventions
Match the conventions of the language you introduce and keep formatting automated where possible. Prefer:
- 2 spaces for Markdown, JSON, and YAML indentation
- Descriptive file and directory names in lowercase with hyphens for docs (`order-flow.md`)
- Clear module names that reflect product behavior (`camera`, `scanner`, `recommendations`)

Add a formatter or linter with the first substantial code contribution and commit its config to the repository.

## Testing Guidelines
Place tests under `tests/` or next to source files only if the chosen framework strongly prefers that pattern. Name tests after the unit under test, such as `catalog.test.js` or `test_catalog.py`.

Every new feature or bug fix should include tests once a test framework is present. Keep fixtures small and readable.
Prioritize coverage for image upload flows, permission handling, and failure cases such as unsupported files or interrupted uploads.

## Commit & Pull Request Guidelines
The current history uses short, imperative commit subjects (`Initial commit`). Continue that style:
- `Add catalog service`
- `Fix cart total rounding`

Pull requests should include:
- A concise summary of the change
- Linked issue or task reference when available
- Notes on testing performed
- Screenshots only for UI changes

## Documentation & Configuration
Update [README.md](C:\Users\gregl\Documents\book-store\README.md) whenever you add setup steps, scripts, or required environment variables. Do not commit secrets; use an ignored local env file such as `.env.local` if configuration is needed.

Document external dependencies early, especially Goodreads access, image-processing services, and any mobile platform credentials.

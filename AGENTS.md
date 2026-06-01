# Codex Working Instructions

For every task in this repository:

1. Make the requested changes completely.
2. Review the diff and ensure the implementation matches the user request.
3. Use the project’s existing tools and scripts.
4. Run relevant checks before finishing:
   - dependency install only if needed
   - lint, if available
   - typecheck, if available
   - tests, if available
   - build, if available

Detect the correct commands from project files such as:
- package.json
- pnpm-lock.yaml
- yarn.lock
- package-lock.json
- Makefile
- pyproject.toml
- requirements.txt
- README.md

If a relevant command fails:
- fix the issue
- rerun the failed command
- do not commit broken code

Before committing, always run:

git status --short
git diff --check

Commit rules:
- commit only changes related to the requested task
- do not include unrelated files
- create one clear commit after checks pass
- use a concise commit message based on the actual update

Commit message format:

<type>: <short description>

Allowed types:
- feat
- fix
- refactor
- style
- docs
- test
- chore

After committing, always return exactly this format:

Summary:
- <what changed>
- <important implementation notes, if any>

Checks:
- <command>: passed
- <command>: passed
- <command>: skipped, <reason>

Commit:
- <commit hash> <commit message>

Status:
- <output of git status --short, or "clean">
# GitHub Pages Publish Playbook

Use this when creating a new static prototype that should be shared by URL without overwriting an existing project.

## Default Pattern

1. Keep the project in its own local folder and its own GitHub repository.
2. Do not reuse or overwrite an example repository, even when using it as a pattern.
3. Keep private runtime data out of Git. For this portal, `private-data/` stays ignored.
4. Commit only the static app files and deployment workflow.
5. Push to the new repository's `main` branch.
6. Enable GitHub Pages with GitHub Actions as the source.
7. Verify the published URL returns `200 OK` and contains the expected app title.

## Visibility Decision

For a simple unauthenticated GitHub Pages link, use a public repository. Use a private repository only when the target GitHub account or organization supports private Pages access and the intended audience can authenticate.

For this project:

- Repository: `https://github.com/hervejeanbaptiste/diligence.ai`
- Published URL: `https://hervejeanbaptiste.github.io/diligence.ai/`
- Deployment workflow: `.github/workflows/deploy.yml`

## Local Checks

Run these before pushing:

```powershell
git status -sb
node --check app.js
git ls-files
```

Confirm the tracked files do not include real active worker files, exports, tokens, or other private data.

## New Repository Flow

Use this shape when the target repository does not exist yet:

```powershell
git init
git branch -M main
git remote add origin https://github.com/hervejeanbaptiste/<new-repo>.git
git add .github/workflows/deploy.yml .gitignore .nojekyll README.md app.js index.html styles.css
git commit -m "Publish config portal prototype"
git push -u origin main
```

If using GitHub API credentials from Git credential storage, never print or persist the token. Use it only inside the command process.

## Pages Setup

After push, enable Pages with workflow builds. The workflow in this repo uploads the repository root as the static site artifact.

Verification:

```powershell
Invoke-WebRequest -Uri "https://hervejeanbaptiste.github.io/<new-repo>/" -UseBasicParsing -TimeoutSec 20
```

A successful deployment should return `200 OK`. Also check that the response contains the expected app title.

## Browser Notes

If the Codex browser connector does not attach, use direct checks plus Chrome:

```powershell
Start-Process -FilePath "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "https://hervejeanbaptiste.github.io/<new-repo>/"
```

This is enough for handoff when the deployed page has already passed the HTTP/title check.

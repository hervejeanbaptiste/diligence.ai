# Diligence.AI Config Portal [ALPHA]

A GitHub Pages-ready prototype for managing people, tool capacities, capacity assignments, knowledge repositories, Excel-backed storage, and a chained audit log for pilot and launch governance.

## What It Does

- Add and modify people associated with the tool.
- Add and modify capacities, seeded with `SME` and `Operator`.
- Assign one or more capacities to each person.
- Import an active worker workbook exported from Teams/SharePoint and match people to that directory.
- Add and modify knowledge repositories that the tool needs.
- Export and import the portal workbook as Excel.
- Export and import a blockchain-style JSONL audit file.
- Verify the audit chain in the browser.

## Local Use

Open `index.html` directly, or serve the folder with any static file server.
No local package install or build step is required.

## GitHub Pages Deployment

The repository includes `.github/workflows/deploy.yml`. After pushing to `main` or `master`, enable GitHub Pages in the repository settings with GitHub Actions as the source.

For the repeatable "new repo, no overwrite" publishing pattern, see [docs/github-pages-publish-playbook.md](docs/github-pages-publish-playbook.md).

## Data Notes

GitHub Pages is static, so this prototype stores the working session in browser storage and treats Excel and JSONL exports as the durable files. For production, the same data model can be moved behind an API that writes directly to SharePoint, OneDrive, or another governed storage location.

The published People search uses `data/masked-people.json`, which must contain only masked or synthetic people records. The live refresh feature is disabled in the prototype; use the Active Workers tab upload control to load a replacement people file in the browser session.

Do not commit the real active worker workbook into a public repository. Import it through the portal at runtime.

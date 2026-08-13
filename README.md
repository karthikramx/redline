# Redline — Document Intelligence

A minimal, dark-mode document-review tool. Upload a `.docx`, tell it what to
review, and it returns suggestion cards you can click to redline (track-change)
directly in the document. Export the redlined `.docx` when done.

Built with:

- **React** (Create React App)
- **[SuperDoc](https://www.superdoc.dev/)** for `.docx` viewing/editing, track changes, and export
- A shadcn-inspired dark UI (hand-rolled CSS variables — no Tailwind needed)

## Run

```bash
npm install --legacy-peer-deps
npm start
```

## Analyze API

By default, the app uses a **deterministic mock analyzer** so the full flow
works offline. Point at a real backend by setting an env var:

```bash
REACT_APP_ANALYZE_URL=https://your.api/analyze npm start
```

### Request

```
POST /analyze
Content-Type: application/json
```

```json
{
  "prompt": "Tighten indemnification and flag ambiguous language",
  "filename": "MSA.docx",
  "documentBase64": "UEsDBBQAAAgIA..."
}
```

### Response

```json
{
  "suggestions": [
    {
      "id": "s1",
      "title": "Tighten ambiguous language",
      "severity": "high",
      "originalText": "The party shall use reasonable efforts to ...",
      "suggestedText": "The party shall use commercially reasonable efforts to ...",
      "reason": "'Reasonable' is ambiguous; 'commercially reasonable' is a recognized standard."
    }
  ]
}
```

`severity` is one of `"high" | "medium" | "low"`.
`originalText` must be a **verbatim substring** of the document so redlining can
locate and replace it in place.

## How redlining works

Clicking a suggestion card:

1. Switches SuperDoc to `suggesting` mode (track changes on).
2. Runs `superdoc.search(originalText)` and `goToSearchResult(...)` to scroll to
   and select the target range.
3. Calls `activeEditor.commands.insertContent(suggestedText)` — because the
   editor is in suggesting mode, the delete+insert is recorded as a tracked
   change (redline) instead of a hard edit.

Review, accept, or reject tracked changes from the SuperDoc toolbar, then use
**Download .docx** to export the edited document.

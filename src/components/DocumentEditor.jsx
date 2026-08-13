import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { SuperDoc } from "@harbour-enterprises/superdoc";
import "@harbour-enterprises/superdoc/style.css";

/**
 * SuperDoc editor wrapper.
 *
 * Props:
 *  - file:  the uploaded File object (docx). Null = empty state.
 *  - onReady(superdoc): fires after the editor is initialized.
 *  - onPlainText(text): fires when plain text is extractable.
 */
export default function DocumentEditor({ file, onReady, onPlainText }) {
  const reactId = useId();
  // SuperDoc requires string CSS selectors, not DOM refs.
  const safeId = reactId.replace(/[^a-zA-Z0-9_-]/g, "");
  const editorId = `sd-editor-${safeId}`;
  const toolbarId = `sd-toolbar-${safeId}`;
  const toolbarRef = useRef(null);
  const editorRef = useRef(null);
  const instanceRef = useRef(null);
  const [error, setError] = useState(null);

  const teardown = useCallback(() => {
    const inst = instanceRef.current;
    instanceRef.current = null;
    if (!inst) return;
    try {
      if (typeof inst.destroy === "function") inst.destroy();
    } catch (e) {
      // no-op
    }
    if (editorRef.current) editorRef.current.innerHTML = "";
    if (toolbarRef.current) toolbarRef.current.innerHTML = "";
  }, []);

  useEffect(() => {
    if (!file) {
      teardown();
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        teardown();
        setError(null);

        const superdoc = new SuperDoc({
          selector: `#${editorId}`,
          toolbar: `#${toolbarId}`,
          documentMode: "editing",
          pagination: true,
          rulers: false,
          documents: [
            {
              id: "doc-1",
              type: "docx",
              data: file,
            },
          ],
          onReady: () => {
            if (cancelled) return;
            instanceRef.current = superdoc;
            onReady?.(superdoc);
            // Best-effort plain text extraction for the mock analyzer.
            try {
              const ed = superdoc.activeEditor;
              const txt = ed?.state?.doc?.textContent || ed?.getText?.() || "";
              onPlainText?.(txt);
            } catch (e) {
              onPlainText?.("");
            }
          },
        });

        instanceRef.current = superdoc;
      } catch (e) {
        console.error("SuperDoc init failed", e);
        if (!cancelled) setError(e?.message || "Failed to load document");
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  return (
    <>
      <div className="toolbar-slot" id={toolbarId} ref={toolbarRef} />
      <div className="editor-wrap">
        <div className="editor-slot" id={editorId} ref={editorRef}>
          {!file && !error && (
            <div className="empty">Upload a .docx to begin.</div>
          )}
          {error && <div className="empty">Error: {error}</div>}
        </div>
      </div>
    </>
  );
}

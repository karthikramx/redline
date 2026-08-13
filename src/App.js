import React, { useCallback, useMemo, useRef, useState } from 'react';
import './App.css';
import DocumentEditor from './components/DocumentEditor';
import SuggestionCard from './components/SuggestionCard';
import SettingsPanel from './components/SettingsPanel';
import { analyzeDocument } from './lib/analyzer';
import { downloadBlob, fileToBase64 } from './lib/fileUtils';

const INITIAL_MESSAGES = [
    {
        role: 'assistant',
        content:
            "Hi. Upload a .docx and tell me what to review — e.g. 'Flag ambiguous language and tighten indemnification clauses'.",
    },
];

export default function App() {
    const [file, setFile] = useState(null);
    const [messages, setMessages] = useState(INITIAL_MESSAGES);
    const [prompt, setPrompt] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [analyzing, setAnalyzing] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [plainText, setPlainText] = useState('');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const superdocRef = useRef(null);
    const fileInputRef = useRef(null);

    const handleUpload = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setFile(f);
        setSuggestions([]);
        setMessages((m) => [
            ...m,
            { role: 'system', content: `Loaded ${f.name}` },
        ]);
        // reset input so re-uploading the same file re-triggers
        e.target.value = '';
    };

    const handleReady = useCallback((sd) => {
        superdocRef.current = sd;
    }, []);

    const handlePlainText = useCallback((text) => {
        setPlainText(text || '');
    }, []);

    const canAnalyze = !!file && !!prompt.trim() && !analyzing;

    const runAnalyze = async () => {
        if (!canAnalyze) return;
        const userPrompt = prompt.trim();
        setMessages((m) => [...m, { role: 'user', content: userPrompt }]);
        setPrompt('');
        setAnalyzing(true);
        try {
            const base64 = await fileToBase64(file);
            const results = await analyzeDocument({
                prompt: userPrompt,
                filename: file.name,
                documentBase64: base64,
                plainText,
            });
            setSuggestions(results);
            setMessages((m) => [
                ...m,
                {
                    role: 'assistant',
                    content:
                        results.length > 0
                            ? `Found ${results.length} suggested edit${results.length === 1 ? '' : 's'}. Click a card to redline in the document.`
                            : 'No suggested edits found for this prompt.',
                },
            ]);
        } catch (err) {
            console.error(err);
            setMessages((m) => [
                ...m,
                { role: 'assistant', content: `Analyze failed: ${err.message || err}` },
            ]);
        } finally {
            setAnalyzing(false);
        }
    };

    const applyRedline = async (suggestion) => {
        const sd = superdocRef.current;
        if (!sd) return;
        const original = (suggestion.originalText || '').trim();
        const replacement = suggestion.suggestedText || '';
        if (!original) return;

        try {
            // Switch to suggesting mode so edits are captured as tracked changes.
            if (typeof sd.setDocumentMode === 'function') {
                sd.setDocumentMode('suggesting');
            }

            // Find and scroll to the match.
            let matches;
            try {
                matches = sd.search(original);
            } catch (e) {
                matches = undefined;
            }
            // Fallback to first 80 chars if the full sentence didn't match exactly.
            if (!matches || matches.length === 0) {
                const short = original.slice(0, Math.min(80, original.length));
                try { matches = sd.search(short); } catch (e) { matches = undefined; }
            }
            if (matches && matches.length > 0) {
                try { sd.goToSearchResult(matches[0]); } catch (e) { /* no-op */ }
            }

            // Replace via the active editor's ProseMirror commands.
            const editor = sd.activeEditor;
            if (editor?.commands?.insertContent) {
                // The current selection should be on the matched text after goToSearchResult.
                // insertContent replaces the current selection.
                editor.commands.insertContent(replacement);
            }
        } catch (e) {
            console.error('Redline failed', e);
        }
    };

    const handleDownload = async () => {
        const sd = superdocRef.current;
        if (!sd || !file) return;
        setDownloading(true);
        try {
            const exportedName = file.name.replace(/\.docx$/i, '') + '-edited.docx';
            // triggerDownload: true asks SuperDoc to save the file directly.
            const blob = await sd.export({
                exportType: 'docx',
                exportedName,
                triggerDownload: false,
                isFinalDoc: false,
            });
            if (blob) downloadBlob(blob, exportedName);
        } catch (e) {
            console.error('Export failed', e);
            setMessages((m) => [
                ...m,
                { role: 'assistant', content: `Download failed: ${e.message || e}` },
            ]);
        } finally {
            setDownloading(false);
        }
    };

    const filenameLabel = useMemo(() => file?.name || 'No document', [file]);

    return (
        <div className="app">
            {/* MAIN */}
            <main className="main">
                <div className="main-header">
                    <div className="main-title">
                        <span>Editor</span>
                        {file && <span style={{ color: 'var(--foreground)' }}>· {file.name}</span>}
                    </div>
                    <div className="main-actions">
                        <button
                            className="btn"
                            onClick={handleDownload}
                            disabled={!file || downloading}
                        >
                            {downloading ? <><span className="spinner" /> Exporting</> : 'Download .docx'}
                        </button>
                    </div>
                </div>
                <DocumentEditor file={file} onReady={handleReady} onPlainText={handlePlainText} />
            </main>

            {/* SIDEBAR */}
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div className="brand">
                        <span className="brand-dot" />
                        <div>
                            <div>Redline</div>
                            <div className="brand-sub">Document Intelligence</div>
                        </div>
                    </div>
                    <button
                        className="icon-btn"
                        title="API key settings"
                        aria-label="API key settings"
                        onClick={() => setSettingsOpen(true)}
                    >
                        ⚙
                    </button>
                </div>

                <div className="section">
                    <div className="section-title">Document</div>
                    <div className="upload-row">
                        <div className={`file-pill ${file ? 'has-file' : ''}`} title={filenameLabel}>
                            {filenameLabel}
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".docx"
                            style={{ display: 'none' }}
                            onChange={handleUpload}
                        />
                        <button className="btn" onClick={() => fileInputRef.current?.click()}>
                            {file ? 'Replace' : 'Upload'}
                        </button>
                    </div>
                </div>

                <div className="chat">
                    <div className="chat-scroll">
                        <div className="chat-messages">
                            {messages.map((m, i) => (
                                <div
                                    key={i}
                                    className={`msg ${m.role === 'user' ? 'msg-user' : m.role === 'system' ? 'msg-system' : 'msg-assistant'}`}
                                >
                                    {m.content}
                                </div>
                            ))}
                            {analyzing && <div className="msg msg-assistant"><span className="spinner" /> Analyzing…</div>}
                        </div>

                        {suggestions.length > 0 && (
                            <div className="cards">
                                <div className="section-title" style={{ padding: 0, margin: 0 }}>
                                    Suggestions ({suggestions.length})
                                </div>
                                {suggestions.map((s) => (
                                    <SuggestionCard
                                        key={s.id}
                                        suggestion={s}
                                        onClick={() => applyRedline(s)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="chat-input">
                        <textarea
                            className="textarea"
                            placeholder="Describe how to review this document…"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    runAnalyze();
                                }
                            }}
                        />
                        <div className="chat-actions">
                            <span className="hint">⌘/Ctrl + Enter to analyze</span>
                            <button
                                className="btn btn-primary"
                                onClick={runAnalyze}
                                disabled={!canAnalyze}
                            >
                                {analyzing ? <><span className="spinner" /> Analyzing</> : 'Analyze'}
                            </button>
                        </div>
                    </div>
                </div>
            </aside>

            <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
    );
}

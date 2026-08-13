import React, { useEffect, useState } from 'react';
import { getOpenAIKey, getOpenAIModel, setOpenAIKey, setOpenAIModel } from '../lib/settingsStore';

/**
 * API key entry, stored only in this browser's localStorage — never written
 * to the codebase, .env, or any build output. Cleared with one click.
 */
export default function SettingsPanel({ open, onClose }) {
  const [keyInput, setKeyInput] = useState('');
  const [modelInput, setModelInput] = useState('');
  const [reveal, setReveal] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    if (open) {
      setKeyInput(getOpenAIKey());
      setModelInput(getOpenAIModel());
      setSavedAt(null);
    }
  }, [open]);

  if (!open) return null;

  const hasStoredKey = !!getOpenAIKey();

  const handleSave = () => {
    setOpenAIKey(keyInput.trim());
    setOpenAIModel(modelInput.trim());
    setSavedAt(Date.now());
  };

  const handleClear = () => {
    setOpenAIKey('');
    setOpenAIModel('');
    setKeyInput('');
    setModelInput('');
    setSavedAt(Date.now());
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <div className="settings-title">OpenAI API Key</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>

        <p className="settings-desc">
          Stored only in this browser's local storage — never sent to our servers,
          never committed to the codebase. It's used to call OpenAI directly from
          your browser, so it stays only on this device.
        </p>

        <label className="settings-label" htmlFor="openai-key">API key</label>
        <div className="settings-input-row">
          <input
            id="openai-key"
            className="input"
            type={reveal ? 'text' : 'password'}
            placeholder="sk-..."
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <button className="btn btn-sm" onClick={() => setReveal((r) => !r)}>
            {reveal ? 'Hide' : 'Show'}
          </button>
        </div>

        <label className="settings-label" htmlFor="openai-model">Model (optional)</label>
        <input
          id="openai-model"
          className="input"
          type="text"
          placeholder="gpt-4o-mini"
          value={modelInput}
          onChange={(e) => setModelInput(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />

        <div className="settings-actions">
          <button className="btn btn-ghost btn-sm" onClick={handleClear} disabled={!hasStoredKey && !keyInput}>
            Clear
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave}>
            Save
          </button>
        </div>

        {savedAt && <div className="hint" style={{ marginTop: 8 }}>Saved to this browser.</div>}
      </div>
    </div>
  );
}

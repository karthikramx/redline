/**
 * Client-side settings persisted to localStorage — never sent anywhere except
 * as part of the user's own direct API calls (e.g. to OpenAI). Kept out of
 * the codebase/env files entirely so nothing secret ever gets bundled or
 * committed to git.
 *
 * Note: localStorage is still readable via DevTools by anyone with access to
 * the user's own browser/machine — this is meant to keep the key out of the
 * source code and build bundle, not to make it uncrackable on a shared device.
 */

const KEYS = {
    openaiApiKey: 'redline:openaiApiKey',
    openaiModel: 'redline:openaiModel',
};

export function getOpenAIKey() {
    try {
        return localStorage.getItem(KEYS.openaiApiKey) || '';
    } catch (e) {
        return '';
    }
}

export function setOpenAIKey(key) {
    try {
        if (key) localStorage.setItem(KEYS.openaiApiKey, key);
        else localStorage.removeItem(KEYS.openaiApiKey);
    } catch (e) {
        // ignore (e.g. storage disabled)
    }
}

export function getOpenAIModel() {
    try {
        return localStorage.getItem(KEYS.openaiModel) || '';
    } catch (e) {
        return '';
    }
}

export function setOpenAIModel(model) {
    try {
        if (model) localStorage.setItem(KEYS.openaiModel, model);
        else localStorage.removeItem(KEYS.openaiModel);
    } catch (e) {
        // ignore
    }
}

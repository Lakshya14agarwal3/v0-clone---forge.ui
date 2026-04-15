/**
 * api.js — forge.ui
 * Handles all communication with the OpenRouter API.
 * Supports streaming responses and conversation history.
 */

const API = {

  /* ── Key management ── */

  getKey() {
    return OPENROUTER_API_KEY;
  },

  setKey(key) {
    // No-op: key is now hardcoded in config.js
  },

  isKeyValid(key) {
    return typeof key === 'string' && key.startsWith('sk-or-') && key.length > 20;
  },

  /* ── Streaming completion ── */

  /**
   * Stream a chat completion from OpenRouter.
   *
   * @param {object}   opts
   * @param {string}   opts.userPrompt   - The current user message
   * @param {string}   opts.model        - OpenRouter model ID
   * @param {string}   opts.mode         - 'multifile' | 'singlefile' | 'component'
   * @param {Array}    opts.history      - Prior messages [{role, content}]
   * @param {Function} opts.onChunk      - (chunkText, fullText) called per token
   * @param {Function} opts.onDone       - (fullText) called when stream ends
   * @param {Function} opts.onError      - (errorMessage) called on failure
   * @param {Function} opts.onStatus     - (message) optional status updates
   */
  async stream({ userPrompt, model, mode, history = [], onChunk, onDone, onError, onStatus }) {
    const key = this.getKey();

    if (!this.isKeyValid(key)) {
      onError('Missing or invalid OpenRouter API key. Set OPENROUTER_API_KEY in config.js (starts with sk-or-).');
      return;
    }

    const modeConfig = MODES[mode];
    if (!modeConfig) {
      onError(`Unknown mode: ${mode}`);
      return;
    }

    // Build messages array: system prompt + history + current prompt
    const messages = [
      { role: 'system', content: modeConfig.systemPrompt },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userPrompt },
    ];

    onStatus?.('Connecting to OpenRouter...');

    let response;
    try {
      response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
          'HTTP-Referer': window.location.origin || 'https://forge-ui.dev',
          'X-Title': 'forge.ui - AI Website Builder',
        },
        body: JSON.stringify({
          model,
          max_tokens: modeConfig.maxTokens,
          temperature: modeConfig.temperature ?? 0.7,
          stream: true,
          messages,
        }),
      });
    } catch (networkErr) {
      onError(`Network error: ${networkErr.message}. Check your internet connection.`);
      return;
    }

    // Non-200 response
    if (!response.ok) {
      let errMsg = `API error ${response.status}`;
      try {
        const errBody = await response.json();
        errMsg = errBody?.error?.message || errMsg;

        // Friendly messages for common errors
        if (response.status === 401) errMsg = 'Invalid API key. Double-check in Settings.';
        if (response.status === 402) errMsg = 'Insufficient OpenRouter credits. Add credits at openrouter.ai.';
        if (response.status === 429) errMsg = 'Rate limited. Wait a moment and try again.';
        if (response.status === 503) errMsg = `Model "${model}" may be unavailable. Try a different model.`;
      } catch { }
      onError(errMsg);
      return;
    }

    onStatus?.('Streaming response…');

    // Read SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep any incomplete line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          const raw = trimmed.slice(6).trim();
          if (raw === '[DONE]') continue;

          try {
            const parsed = JSON.parse(raw);

            // OpenAI-compatible delta (used by most OpenRouter models)
            let chunk = parsed?.choices?.[0]?.delta?.content ?? '';

            // Anthropic-style delta (some direct Anthropic routes)
            if (!chunk && parsed?.type === 'content_block_delta') {
              chunk = parsed?.delta?.text ?? '';
            }

            if (chunk) {
              fullText += chunk;
              onChunk(chunk, fullText);
            }

            // Check for finish reason
            const finishReason = parsed?.choices?.[0]?.finish_reason;
            if (finishReason && finishReason !== 'null' && finishReason !== null) {
              onStatus?.(`Done (finish: ${finishReason})`);
            }
          } catch {
            // Silently skip malformed SSE chunks
          }
        }
      }
    } catch (streamErr) {
      // Stream was aborted or connection dropped
      if (fullText.length > 50) {
        // We got substantial output — try to use it
        onStatus?.('Stream interrupted, using partial output…');
        onDone(fullText);
      } else {
        onError(`Stream interrupted: ${streamErr.message}`);
      }
      return;
    }

    onDone(fullText);
  },
};

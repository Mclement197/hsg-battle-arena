import { createObserver } from './observer.mjs';

// Plain definition objects are supported by the installed OpenClaw plugin loader.
export default {
  id: 'afp-skill-observer',
  name: 'AFP Skill Observer',
  description: 'Prospective, allowlisted instruction-load metadata only.',
  register(api) {
    try {
      const observer = createObserver(api.pluginConfig, api.logger);
      api.on('after_tool_call', observer.handler, { matcher: ['skills_read', 'read'] });
    } catch {
      try { api.logger?.warn?.('afp-skill-observer: CONFIG_OR_REGISTRATION_FAILED'); } catch { /* best effort */ }
    }
  }
};

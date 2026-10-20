// Metro's configuration: Expo's default. One addition, for the simulator
// visual audit only (round 24 A4; README "Verification", "Visual audit"): with
// VISUAL_AUDIT=1, the session store and the appearance store resolve to
// scripts/visual-audit/'s fixtures — a session that needs no sign-in, and the
// simulator's appearance — so the audited screens render in a local Debug
// build. Refused for a production or EAS build; no shipped code path changes.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (process.env.VISUAL_AUDIT === '1') {
  if (process.env.NODE_ENV === 'production' || process.env.EAS_BUILD) {
    throw new Error('VISUAL_AUDIT=1 is for a local Debug build only, never a production or EAS build.');
  }
  const swaps = new Map([
    [path.join(__dirname, 'lib/platform/session-store.ts'), path.join(__dirname, 'scripts/visual-audit/session-store.ts')],
    [path.join(__dirname, 'lib/platform/appearance-store.ts'), path.join(__dirname, 'scripts/visual-audit/appearance-store.ts')],
  ]);
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const resolved = (upstream ?? context.resolveRequest)(context, moduleName, platform);
    const swap = resolved.type === 'sourceFile' ? swaps.get(resolved.filePath) : undefined;
    // The swap itself imports the real module: that import is left alone.
    return swap && context.originModulePath !== swap ? { type: 'sourceFile', filePath: swap } : resolved;
  };
}

module.exports = config;

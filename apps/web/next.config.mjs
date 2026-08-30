/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully client-rendered app → export a static site (free hosting on Azure
  // Static Web Apps / any static host). No Node server needed for the frontend.
  output: 'export',
  // Emits `out/reset-password/index.html` rather than `out/reset-password.html`.
  // Azure Static Web Apps resolves a directory index for an extensionless URL,
  // so the emailed reset link works without a rewrite rule.
  trailingSlash: true,
  // Disabled: React Strict Mode double-invokes effects in dev, which conflicts
  // with TipTap's React node views (images/PDFs) and throws a removeChild
  // NotFoundError when ProseMirror and React both manage the same DOM.
  reactStrictMode: false,
  // Hide the dev overlay/indicator. It pings the npm registry to check for a
  // newer Next.js version, which a corporate proxy blocks ("NPM URL Block").
  devIndicators: false,
};

export default nextConfig;

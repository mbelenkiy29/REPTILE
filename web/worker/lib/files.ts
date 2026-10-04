// Which files are worth reading or indexing. Lockfiles, build output, vendored and binary files are skipped.
const SKIP = [
  /(^|\/)(node_modules|vendor|dist|build|out|\.next|coverage|target|__pycache__|\.git)\//,
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/,
  /\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|tgz|jar|woff2?|ttf|eot|mp4|mov|mp3|wasm|so|dylib|dll|exe|bin|lockb)$/i,
  /\.min\.(js|css)$/,
  /\.(map|snap)$/,
];

export const isSkippable = (path: string) => SKIP.some((r) => r.test(path));

export function looksBinary(text: string) {
  return text.slice(0, 8000).includes("\u0000");
}

/** Stand-in for SvelteKit's $env/dynamic/private, which is only available through the Vite plugin. */
export const env = process.env as Record<string, string | undefined>;

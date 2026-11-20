// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  // Placeholder until the preview has an address. Previews stay noindex either way.
  site: 'https://betawi-preview.pages.dev',
  output: 'static',
  build: {
    // The CSS is small, so put it inside each page instead of a separate file.
    inlineStylesheets: 'always',
  },
});

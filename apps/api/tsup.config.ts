import { defineConfig } from 'tsup';
export default defineConfig({entry:['src/server.ts','src/cli.ts'],format:['esm'],platform:'node',target:'node22',outDir:'dist',noExternal:['@campus/contracts'],external:['@napi-rs/canvas','tesseract.js','@tesseract.js-data/chi_sim'],sourcemap:true,clean:true});

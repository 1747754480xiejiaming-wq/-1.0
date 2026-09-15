import { defineConfig } from 'tsup';
export default defineConfig({entry:['src/index.ts'],format:['esm'],platform:'node',target:'node22',outDir:'dist',noExternal:['@campus/contracts'],sourcemap:true,clean:true});

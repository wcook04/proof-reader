import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// VITE_BASE_PATH is the folder the site is served from, such as /proof-reader/.
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react()],
});

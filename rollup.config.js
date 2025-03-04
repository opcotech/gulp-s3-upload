import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";

export default {
  input: "src/index.ts",
  output: [
    {
      file: "dist/index.js",
      format: "cjs",
      sourcemap: true,
    },
    {
      file: "dist/index.esm.js",
      format: "esm",
      sourcemap: true,
    },
  ],
  external: [
    "event-stream",
    "@aws-sdk/client-s3",
    "@aws-sdk/lib-storage",
    "mime",
    "hasha",
    "plugin-error",
    "fancy-log",
    "ansi-colors",
    "path",
  ],
  plugins: [
    typescript({
      tsconfig: "./tsconfig.json",
      declaration: true,
      declarationDir: "./dist",
      rootDir: "./src",
    }),
    nodeResolve(),
    commonjs(),
    terser(),
  ],
};

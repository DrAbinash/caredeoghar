// `generated/api` re-exports zod schemas (values) for every body / params /
// response type. To avoid TS2308 "already exported" collisions with the
// type-namespace siblings under `generated/types`, consumers that need a TS
// interface should import it directly from `@workspace/api-zod/types/<name>`.
export * from "./generated/api";

// Augment *.mdx module declarations to support named exports
// This file must be a script (no top-level imports) to merge with @types/mdx
declare module '*.mdx' {
  export const metadata: import('next').Metadata
  export const sections: Array<{ title: string; id: string }>
}

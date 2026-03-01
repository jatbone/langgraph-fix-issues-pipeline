/**
 * Utility type that flattens intersected types for better IDE display.
 * Instead of showing `A & B`, the tooltip will show the merged object type.
 */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

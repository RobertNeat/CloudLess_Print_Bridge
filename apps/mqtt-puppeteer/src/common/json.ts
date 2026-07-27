export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

const blockedKeys = new Set(['__proto__', 'constructor', 'prototype']);

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

export function deepMerge(target: JsonObject, patch: JsonObject): JsonObject {
  const result = cloneJson(target);

  for (const [key, patchValue] of Object.entries(patch)) {
    if (blockedKeys.has(key)) continue;

    const currentValue = result[key];
    result[key] =
      isJsonObject(currentValue) && isJsonObject(patchValue)
        ? deepMerge(currentValue, patchValue)
        : cloneJson(patchValue);
  }

  return result;
}

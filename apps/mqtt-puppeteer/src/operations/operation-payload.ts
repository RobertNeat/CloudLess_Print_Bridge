import { cloneJson, isJsonObject, type JsonObject } from '../common/json';

export function applyOperationSequence(
  payload: JsonObject,
  sequenceId: string,
): JsonObject {
  const result = cloneJson(payload);
  apply(result, sequenceId);
  return result;
}

function apply(value: JsonObject, sequenceId: string): void {
  if ('sequence_id' in value || typeof value.command === 'string') {
    value.sequence_id = sequenceId;
  }
  for (const entry of Object.values(value)) {
    if (Array.isArray(entry)) {
      for (const item of entry) {
        if (isJsonObject(item)) apply(item, sequenceId);
      }
    } else if (isJsonObject(entry)) {
      apply(entry, sequenceId);
    }
  }
}

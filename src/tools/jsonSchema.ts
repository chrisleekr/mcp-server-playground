import type { z } from 'zod';

// zod 4 emits z.date() as {} and drops additionalProperties:false in input mode, so restore both to match the previous wire contract.
type Override = NonNullable<z.core.ToJSONSchemaParams['override']>;

const dateOverride: Override = (ctx): void => {
  if (ctx.zodSchema._zod.def.type === 'date') {
    ctx.jsonSchema.type = 'string';
    ctx.jsonSchema.format = 'date-time';
  }
};

const inputOverride: Override = (ctx): void => {
  dateOverride(ctx);
  const def = ctx.zodSchema._zod.def;
  if (
    def.type === 'object' &&
    def.catchall === undefined &&
    ctx.jsonSchema.additionalProperties === undefined
  ) {
    ctx.jsonSchema.additionalProperties = false;
  }
};

// io: input keeps defaulted fields optional for MCP clients; any avoids throwing on unsupported types.
export const INPUT_JSON_SCHEMA_OPTIONS: z.core.ToJSONSchemaParams = {
  io: 'input',
  target: 'draft-07',
  unrepresentable: 'any',
  override: inputOverride,
};

export const OUTPUT_JSON_SCHEMA_OPTIONS: z.core.ToJSONSchemaParams = {
  target: 'draft-07',
  unrepresentable: 'any',
  override: dateOverride,
};

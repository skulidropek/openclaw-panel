export type JsonPrimitive = boolean | null | number | string

export type Json = JsonPrimitive | ReadonlyArray<Json> | JsonObject

export type JsonObject = {
  readonly [key: string]: Json
}

export const isJsonObject = (value: Json): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const isJsonArray = (value: Json | undefined): value is ReadonlyArray<Json> => Array.isArray(value)

export const stringValue = (value: Json | undefined): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null

export const numberValue = (value: Json | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null

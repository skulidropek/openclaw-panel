import type { Json } from "./json.js"

// CHANGE: isolate the JSON.parse cast in the allowed axiomatic module
// WHY: JSON.parse is dynamically typed; all consumers receive the Json algebraic data type
// QUOTE(TZ): "все boundary-данные декодируются"
// REF: user-2026-05-04-openclaw-panel
// SOURCE: n/a
// FORMAT THEOREM: forall text in ValidJsonText: parseJson(text) in Json
// PURITY: CORE
// EFFECT: none
// INVARIANT: this is the only production cast boundary
// COMPLEXITY: O(n)/O(n)
export const parseJson = (text: string): Json => JSON.parse(text) as Json

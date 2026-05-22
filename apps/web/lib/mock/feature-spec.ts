import type { FeatureSpec } from "@/lib/types"

export const FEATURE_SPEC: FeatureSpec = {
  title: "Saved Carts — Cross-Device Persistence",
  lede: "Authenticated shoppers can save their cart and resume it on any device. Anonymous carts merge non-destructively at sign-in. Stale carts (>30d) are pruned with a one-time recovery window.",
  what: [
    "Add a 'Save cart' action to the cart page for authenticated users; cart is saved server-side and resumes automatically on next session.",
    "Anonymous carts are persisted in localStorage and merged with the server cart on sign-in (line-item deduplication by SKU, quantities summed).",
    "Carts older than 30 days are soft-deleted with a 7-day recovery window via /cart/restore.",
  ],
  flows: [
    "Auth user → adds item → clicks Save cart → sees confirmation → logs in on another device → cart restored automatically.",
    "Anon user → builds cart → signs in → server-cart and local-cart merge → deduped cart shown.",
    "User returns after 31 days → empty cart shown → banner offers one-tap restore for 7 days.",
  ],
  contracts: [
    "POST /api/cart/save — body: { idempotency_key }. 200 { cart_id, saved_at }. Auth required.",
    "GET /api/cart/active — 200 { cart, source: 'session'|'restored' } | 204.",
    "POST /api/cart/merge — body: { local_items: [{sku, qty}] }. 200 { cart, conflicts: [] }.",
    "POST /api/cart/restore?token=… — 200 | 410 if window expired.",
  ],
  acceptance: [
    "Saving a cart on Device A and signing in on Device B restores all line items within 2 s P95.",
    "Anon→auth merge preserves all SKUs from both carts; quantities are summed; no duplicates.",
    "Carts older than 30 days are not returned by /cart/active; calling /cart/restore within 7 days resurrects them.",
    "Idempotency: replaying POST /cart/save with the same key within 24 h returns the original cart_id.",
  ],
}

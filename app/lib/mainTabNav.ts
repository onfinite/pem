import type { Href } from "expo-router";

/** Bottom bar order: left → right */
export const MAIN_TAB_HREFS = ["/inbox", "/thoughts", "/done"] as const;
export type MainTabHref = (typeof MAIN_TAB_HREFS)[number];

type MainTabRouteName = "inbox" | "thoughts" | "done";

const ROUTE_BY_HREF: Record<MainTabHref, MainTabRouteName> = {
  "/inbox": "inbox",
  "/thoughts": "thoughts",
  "/done": "done",
};

let pendingReplaceAnim: { route: MainTabRouteName; type: "push" | "pop" } | null =
  null;

export function currentMainTab(pathname: string | undefined): MainTabHref | null {
  if (!pathname) return null;
  if (pathname.includes("/thoughts")) return "/thoughts";
  if (pathname.includes("/done")) return "/done";
  if (pathname.includes("/inbox")) return "/inbox";
  return null;
}

/**
 * Switches between main hub tabs with replace (no stack pile-up) and sets
 * `animationTypeForReplace` on the destination so iOS matches tab bar direction
 * (rightward tab = push, leftward = pop).
 */
export function navigateMainTab(
  pathname: string | undefined,
  target: MainTabHref,
  replace: (href: Href) => void,
): void {
  const current = currentMainTab(pathname);
  if (current === target) return;

  const order = MAIN_TAB_HREFS;
  const fromIdx = current != null ? order.indexOf(current) : -1;
  const toIdx = order.indexOf(target);

  if (fromIdx >= 0 && toIdx > fromIdx) {
    pendingReplaceAnim = { route: ROUTE_BY_HREF[target], type: "push" };
  } else if (fromIdx >= 0 && toIdx < fromIdx) {
    pendingReplaceAnim = { route: ROUTE_BY_HREF[target], type: "pop" };
  } else {
    pendingReplaceAnim = { route: ROUTE_BY_HREF[target], type: "push" };
  }

  replace(target);
}

/** Consumed by `(app)/_layout` Stack `screenOptions` for the destination route only. */
export function replaceAnimationForRoute(routeName: string): "push" | "pop" | undefined {
  if (!pendingReplaceAnim || pendingReplaceAnim.route !== routeName) {
    return undefined;
  }
  const t = pendingReplaceAnim.type;
  pendingReplaceAnim = null;
  return t;
}

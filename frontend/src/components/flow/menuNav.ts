import type { KeyboardEvent } from "react";

// index of the item an arrow key moves to, wrapping around; -1 when the key is not a menu key
export function nextMenuIndex(key: string, current: number, count: number): number {
  if (count <= 0) return -1;
  if (key === "ArrowDown") return (current + 1) % count;
  if (key === "ArrowUp") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return -1;
}

// ARROW / HOME / END NAVIGATION ACROSS THE [data-menu-item] BUTTONS INSIDE A MENU CONTAINER.
// Returns true when it moved focus (the caller may play its hover sound).
export function handleMenuKeys(e: KeyboardEvent<HTMLElement>, container: HTMLElement | null): boolean {
  if (!container) return false;
  const items = Array.from(container.querySelectorAll<HTMLElement>("[data-menu-item]")).filter((el) => !el.hasAttribute("disabled"));
  const next = nextMenuIndex(e.key, items.indexOf(document.activeElement as HTMLElement), items.length);
  if (next === -1) return false;
  e.preventDefault();
  items[next]?.focus();
  return true;
}

import { Key, ReactNode, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";

interface Row<T> {
  key: string;
  item: T;
  state: "idle" | "enter" | "exit";
  isNew: boolean;
}

interface TransitionListProps<T> {
  items: T[];
  getKey: (item: T) => string;
  children: (item: T, meta: { isNew: boolean; exiting: boolean }) => ReactNode;
  // how long a removed row stays mounted to play its exit animation
  exitMs?: number;
  // new rows get a highlight sweep only after the first render (not on initial mount)
  highlightNew?: boolean;
  className?: string;
  itemClassName?: string;
  as?: "div" | "ul" | "ol";
}

// LIST WHOSE ROWS ENTER, LEAVE AND RE-ORDER SMOOTHLY. Removed rows stay mounted for `exitMs`
// (animate-item-out), added rows animate in (animate-item-in) and are flagged `isNew`, and rows
// that change position glide there with a FLIP transform instead of snapping. Only transform and
// opacity are animated. With reduced motion everything is instant.
export default function TransitionList<T>({
  items,
  getKey,
  children,
  exitMs = 200,
  highlightNew = true,
  className,
  itemClassName = "",
  as = "div",
}: TransitionListProps<T>) {
  const reduced = useReducedMotion();
  const [rows, setRows] = useState<Row<T>[]>(() =>
    items.map((item) => ({ key: getKey(item), item, state: "idle" as const, isNew: false }))
  );
  const mountedOnce = useRef(false);
  const nodes = useRef(new Map<string, HTMLElement>());
  const lastRects = useRef(new Map<string, DOMRect>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // reconcile the incoming items against what is on screen
  useLayoutEffect(() => {
    setRows((prev) => {
      const prevByKey = new Map(prev.map((r) => [r.key, r]));
      const nextKeys = new Set(items.map(getKey));
      const next: Row<T>[] = items.map((item) => {
        const key = getKey(item);
        const old = prevByKey.get(key);
        if (old && old.state !== "exit") return { key, item, state: "idle", isNew: old.isNew };
        return {
          key,
          item,
          state: reduced ? "idle" : "enter",
          isNew: mountedOnce.current && highlightNew && !old,
        };
      });
      // rows that just disappeared: keep them, flagged as exiting, at roughly their old slot
      prev.forEach((row, idx) => {
        if (nextKeys.has(row.key)) return;
        if (reduced || exitMs <= 0) return;
        const exiting: Row<T> = { ...row, state: "exit", isNew: false };
        const insertAt = Math.min(idx, next.length);
        next.splice(insertAt, 0, exiting);
        if (!timers.current.has(row.key)) {
          timers.current.set(
            row.key,
            setTimeout(() => {
              timers.current.delete(row.key);
              setRows((cur) => cur.filter((r) => !(r.key === row.key && r.state === "exit")));
            }, exitMs)
          );
        }
      });
      return next;
    });
    mountedOnce.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // clear any pending exit timers on unmount
  useLayoutEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((t) => clearTimeout(t));
      pending.clear();
    };
  }, []);

  // FLIP: measure after every commit, and play the inverse transform for rows that moved
  useLayoutEffect(() => {
    const prevRects = lastRects.current;
    const nextRects = new Map<string, DOMRect>();
    nodes.current.forEach((el, key) => {
      nextRects.set(key, el.getBoundingClientRect());
    });
    if (!reduced) {
      nextRects.forEach((rect, key) => {
        const before = prevRects.get(key);
        const el = nodes.current.get(key);
        if (!before || !el) return;
        const dx = before.left - rect.left;
        const dy = before.top - rect.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        void el.offsetWidth;
        el.style.transition = "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)";
        el.style.transform = "";
      });
    }
    lastRects.current = nextRects;
  });

  const Tag = as;
  return (
    <Tag className={className}>
      {rows.map((row) => (
        <div
          key={row.key as Key}
          ref={(el) => {
            if (el) nodes.current.set(row.key, el);
            else nodes.current.delete(row.key);
          }}
          className={`${itemClassName} ${
            row.state === "exit"
              ? "animate-item-out pointer-events-none"
              : row.state === "enter"
              ? "animate-item-in"
              : ""
          } ${row.isNew ? "animate-item-highlight rounded-lg" : ""}`}
          aria-hidden={row.state === "exit" ? true : undefined}
        >
          {children(row.item, { isNew: row.isNew, exiting: row.state === "exit" })}
        </div>
      ))}
    </Tag>
  );
}

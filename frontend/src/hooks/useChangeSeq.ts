import { useEffect, useRef, useState } from "react";

// A COUNTER THAT BUMPS EVERY TIME `value` CHANGES (NEVER ON THE FIRST RENDER). Used as a React key
// to restart a one-shot css animation, e.g. the band-crossing flash or the DEFCON slide.
export function useChangeSeq<T>(value: T): number {
  const prev = useRef(value);
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    if (Object.is(prev.current, value)) return;
    prev.current = value;
    setSeq((n) => n + 1);
  }, [value]);

  return seq;
}

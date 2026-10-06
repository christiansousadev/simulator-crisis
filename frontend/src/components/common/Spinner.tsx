import { Loader2 } from "lucide-react";

interface SpinnerProps {
  label?: string;
  className?: string;
  // "sm" is an inline 14px glyph for buttons and rows; "md" is the centered panel loader
  size?: "sm" | "md";
}

// loading indicator, used wherever a panel is waiting on its first backend fetch. role="status" so
// assistive tech announces the label
export default function Spinner({ label, className = "", size = "md" }: SpinnerProps) {
  if (size === "sm") {
    return (
      <span role="status" className={`inline-flex items-center gap-1.5 text-slate-400 ${className}`}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        {label && <span className="text-caption">{label}</span>}
      </span>
    );
  }
  return (
    <div role="status" className={`flex flex-col items-center justify-center gap-2 py-8 text-slate-400 ${className}`}>
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      {label && <p className="text-xs">{label}</p>}
    </div>
  );
}

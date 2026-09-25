import { Loader2 } from "lucide-react";

interface SpinnerProps {
  label?: string;
  className?: string;
}

// small centered loading indicator, used wherever a panel is waiting on its first backend fetch
export default function Spinner({ label, className = "" }: SpinnerProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-slate-400 py-8 ${className}`}>
      <Loader2 className="w-5 h-5 animate-spin" />
      {label && <p className="text-xs">{label}</p>}
    </div>
  );
}

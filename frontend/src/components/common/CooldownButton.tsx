import { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

interface CooldownButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  progress: number;
  children: ReactNode;
}

// wraps a button with a radial cooldown sweep mask; progress 1 = just fired, 0 = ready
export default function CooldownButton({ progress, children, className = "", ...rest }: CooldownButtonProps) {
  const overlayStyle = { "--progress": progress } as CSSProperties;

  return (
    <button {...rest} className={`relative overflow-hidden ${className}`}>
      {children}
      {progress > 0 && (
        <div className="cooldown-ring absolute inset-0 pointer-events-none" style={overlayStyle} />
      )}
    </button>
  );
}

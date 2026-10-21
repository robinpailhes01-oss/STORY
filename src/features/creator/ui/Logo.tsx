/** Notre logo : « Story » en serif italique (Playfair Display). */
export function Logo({ className = "", size = 34 }: { className?: string; size?: number }) {
  return (
    <span className={`font-display leading-none text-white select-none ${className}`} style={{ fontSize: size }}>
      Story
    </span>
  );
}

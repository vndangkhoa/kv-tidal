import React from "react";

interface LogoProps {
  className?: string;
  size?: number;
  color?: string;
}

/**
 * Authentic TIDAL 4-Diamond Monogram:
 * 3 diamonds in the top row, 1 diamond centered below forming the iconic "T" emblem.
 */
export function Logo({ className = "w-6 h-4", size, color = "currentColor" }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 16"
      width={size}
      height={size ? (size * 16) / 24 : undefined}
      className={className}
      fill={color}
      aria-label="TIDAL Logo"
    >
      {/* Top Left Diamond */}
      <polygon points="4,0 8,4 4,8 0,4" />
      {/* Top Center Diamond */}
      <polygon points="12,0 16,4 12,8 8,4" />
      {/* Top Right Diamond */}
      <polygon points="20,0 24,4 20,8 16,4" />
      {/* Bottom Center Diamond */}
      <polygon points="12,8 16,12 12,16 8,12" />
    </svg>
  );
}

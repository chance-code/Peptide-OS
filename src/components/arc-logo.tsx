interface ArcLogoProps {
  size?: number
  className?: string
  withGlow?: boolean
}

export function ArcLogo({ size = 64, className = '', withGlow = true }: ArcLogoProps) {
  // Arc geometry: ~300° sweep, gap at upper-right
  // The arc runs from bottom-right clockwise to upper-right
  const r = 50.8
  const cx = 100
  const cy = 100
  const strokeWidth = 8.2

  // Calculate arc endpoint for the glowing dot
  // Arc starts at ~40° (lower right) and ends at ~340° (upper right)
  // With stroke-dashoffset=-22, the arc is rotated
  // The visual endpoint is at approximately 40° from the positive x-axis
  const endAngleRad = (40 * Math.PI) / 180
  const dotX = cx + r * Math.cos(endAngleRad)
  const dotY = cy - r * Math.sin(endAngleRad)

  const id = `arc-logo-${Math.random().toString(36).slice(2, 8)}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Arc gradient: dark teal → bright cyan */}
        <linearGradient id={`${id}-gradient`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0d9488" />
          <stop offset="50%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#67e8f9" />
        </linearGradient>
        {withGlow && (
          <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#67e8f9" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
          </radialGradient>
        )}
      </defs>

      {/* Main arc */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={`url(#${id}-gradient)`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray="274.7 44.3"
        strokeDashoffset="-22"
      />

      {/* Glowing endpoint */}
      {withGlow && (
        <>
          <circle cx={dotX} cy={dotY} r="16" fill={`url(#${id}-glow)`} />
          <circle cx={dotX} cy={dotY} r="5.5" fill="#67e8f9" />
        </>
      )}
    </svg>
  )
}

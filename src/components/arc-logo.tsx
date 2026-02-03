interface ArcLogoProps {
  size?: number
  className?: string
  withGlow?: boolean
}

export function ArcLogo({ size = 64, className = '', withGlow = true }: ArcLogoProps) {
  // Arc geometry: ~270° sweep, gap at upper-right
  // Matches the new brand icon — open arc from ~5 o'clock to ~1 o'clock
  const r = 48
  const cx = 100
  const cy = 100
  const strokeWidth = 12

  // Arc endpoint: the glowing sphere sits at ~55° (upper-right, ~1 o'clock)
  const endAngleRad = (55 * Math.PI) / 180
  const dotX = cx + r * Math.cos(endAngleRad)
  const dotY = cy - r * Math.sin(endAngleRad)

  const id = `arc-logo-${Math.random().toString(36).slice(2, 8)}`

  // Circumference and arc length for ~270° sweep
  const circumference = 2 * Math.PI * r
  const arcLength = (270 / 360) * circumference
  const gapLength = circumference - arcLength

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Arc gradient: steel blue at bottom → mint cyan at top */}
        <linearGradient id={`${id}-gradient`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#334d7a" />
          <stop offset="40%" stopColor="#4a9e9e" />
          <stop offset="70%" stopColor="#6ee7c0" />
          <stop offset="100%" stopColor="#a7f3d0" />
        </linearGradient>
        {withGlow && (
          <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a7f3d0" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#6ee7c0" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#6ee7c0" stopOpacity="0" />
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
        strokeDasharray={`${arcLength} ${gapLength}`}
        strokeDashoffset="-18"
      />

      {/* Glowing endpoint sphere */}
      {withGlow && (
        <>
          <circle cx={dotX} cy={dotY} r="18" fill={`url(#${id}-glow)`} />
          <circle cx={dotX} cy={dotY} r="6.5" fill="#a7f3d0" />
        </>
      )}
    </svg>
  )
}

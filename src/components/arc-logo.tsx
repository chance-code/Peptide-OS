interface ArcLogoProps {
  size?: number
  className?: string
}

export function ArcLogo({ size = 64, className = '' }: ArcLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Background */}
      <rect width="1024" height="1024" rx="224" fill="#0B0B0D" />

      {/* Hexagon */}
      <path
        d="M872 512 L692 823.769 L332 823.769 L152 512 L332 200.231 L692 200.231 Z"
        fill="#D6B07A"
      />

      {/* Waveform cutout bars */}
      <g fill="#0B0B0D">
        <rect x="373" y="432" width="44" height="160" rx="22" />
        <rect x="451" y="362" width="44" height="300" rx="22" />
        <rect x="529" y="392" width="44" height="240" rx="22" />
        <rect x="607" y="422" width="44" height="180" rx="22" />
      </g>
    </svg>
  )
}

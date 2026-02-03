'use client'

interface SyringeVisualProps {
  units: number // The units to draw
  dose: string // e.g., "500mcg"
  concentration: string // e.g., "5 mg/mL"
  maxUnits?: number // Syringe capacity (default 20 for pen)
}

export function SyringeVisual({ units, dose, concentration, maxUnits = 20 }: SyringeVisualProps) {
  // Clamp units to 0-maxUnits
  const fillUnits = Math.min(maxUnits, Math.max(0, units))
  const fillPercent = fillUnits / maxUnits

  // Generate tick marks based on max units
  const ticks = []
  const tickInterval = maxUnits <= 20 ? 2 : maxUnits <= 50 ? 5 : 10
  for (let i = 0; i <= maxUnits; i += tickInterval) {
    ticks.push(i)
  }

  return (
    <div className="mt-3">
      <div className="text-sm font-medium text-[var(--foreground)] mb-2">Draw to {units} units</div>

      {/* Syringe Container */}
      <div className="relative bg-[var(--muted)] rounded-lg p-3">
        {/* Syringe Body */}
        <div className="flex items-center gap-2">
          {/* Plunger */}
          <div className="w-3 h-10 bg-[var(--border)] rounded-l-sm" />

          {/* Barrel */}
          <div className="flex-1 relative">
            {/* Barrel outline */}
            <div className="h-10 bg-[var(--background)] border-2 border-[var(--border)] rounded-r relative overflow-hidden">
              {/* Fill level */}
              <div
                className="absolute left-0 top-0 bottom-0 bg-blue-300 transition-all duration-300"
                style={{ width: `${fillPercent * 100}%` }}
              />

              {/* Tick marks */}
              <div className="absolute inset-0 flex justify-between px-0.5">
                {ticks.map((tick) => (
                  <div
                    key={tick}
                    className={`w-px ${tick === 0 || tick === maxUnits || tick === maxUnits / 2 ? 'h-full bg-[var(--muted-foreground)]' : 'h-1/2 bg-[var(--border)]'}`}
                  />
                ))}
              </div>

              {/* Fill line indicator */}
              {fillUnits > 0 && fillUnits < maxUnits && (
                <div
                  className="absolute top-0 bottom-0 w-1 bg-blue-600 rounded"
                  style={{ left: `calc(${fillPercent * 100}% - 2px)` }}
                />
              )}
            </div>

            {/* Unit labels */}
            <div className="flex justify-between text-xs text-[var(--muted-foreground)] mt-1">
              <span>0</span>
              <span>{maxUnits / 2}</span>
              <span>{maxUnits}</span>
            </div>
          </div>

          {/* Needle */}
          <div className="w-6 h-0.5 bg-[var(--muted-foreground)] rounded-r-full" />
        </div>

        {/* Annotation */}
        <div className="mt-3 text-center">
          <div className="inline-flex items-center gap-2 bg-[var(--accent)]/10 text-[var(--accent)] px-3 py-1.5 rounded-full text-sm font-medium">
            <span className="w-3 h-3 bg-blue-500 rounded-full" />
            {dose} = {units} units
          </div>
        </div>

        {/* mL conversion */}
        <div className="mt-2 text-xs text-[var(--muted-foreground)] text-center">
          {units} units = {(units * 0.01).toFixed(2)} mL
        </div>
      </div>
    </div>
  )
}

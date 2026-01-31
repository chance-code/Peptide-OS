'use client'

interface SyringeVisualProps {
  units: number // 0-100
  dose: string // e.g., "500mcg"
  concentration: string // e.g., "5 mg/mL"
}

export function SyringeVisual({ units, dose, concentration }: SyringeVisualProps) {
  // Clamp units to 0-100
  const fillUnits = Math.min(100, Math.max(0, units))
  const fillPercent = fillUnits / 100

  return (
    <div className="mt-3">
      <div className="text-sm font-medium text-slate-700 mb-2">Draw to {units} units</div>

      {/* Syringe Container */}
      <div className="relative bg-slate-100 rounded-lg p-3">
        {/* Syringe Body */}
        <div className="flex items-center gap-2">
          {/* Plunger */}
          <div className="w-3 h-8 bg-slate-300 rounded-l-sm" />

          {/* Barrel */}
          <div className="flex-1 relative">
            {/* Barrel outline */}
            <div className="h-8 bg-white border-2 border-slate-300 rounded-r relative overflow-hidden">
              {/* Fill level */}
              <div
                className="absolute left-0 top-0 bottom-0 bg-blue-200 transition-all duration-300"
                style={{ width: `${fillPercent * 100}%` }}
              />

              {/* Tick marks */}
              <div className="absolute inset-0 flex justify-between px-1">
                {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((tick) => (
                  <div
                    key={tick}
                    className={`w-px ${tick % 50 === 0 ? 'h-full bg-slate-400' : tick % 10 === 0 ? 'h-3/4 bg-slate-300' : 'h-1/2 bg-slate-200'}`}
                  />
                ))}
              </div>

              {/* Fill line indicator */}
              {fillUnits > 0 && fillUnits < 100 && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-blue-600"
                  style={{ left: `${fillPercent * 100}%` }}
                />
              )}
            </div>

            {/* Unit labels */}
            <div className="flex justify-between text-xs text-slate-500 mt-1 px-1">
              <span>0</span>
              <span>50</span>
              <span>100</span>
            </div>
          </div>

          {/* Needle */}
          <div className="w-8 h-1 bg-slate-400 rounded-r-full" />
        </div>

        {/* Annotation */}
        <div className="mt-3 text-center">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-800 px-3 py-1.5 rounded-full text-sm font-medium">
            <span className="w-3 h-3 bg-blue-500 rounded-full" />
            {dose} = {units} units
          </div>
        </div>
      </div>

      {/* Explanation */}
      <div className="mt-2 text-xs text-slate-500 text-center">
        At {concentration} concentration
      </div>
    </div>
  )
}

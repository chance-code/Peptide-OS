'use client'

import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-slate-200',
        className
      )}
    />
  )
}

export function DoseCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <Skeleton className="h-5 w-24 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="w-10 h-10 rounded-full" />
      </div>
    </div>
  )
}

export function SummarySkeleton() {
  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-white rounded-lg p-3 border border-slate-100">
          <Skeleton className="h-8 w-8 mx-auto mb-1" />
          <Skeleton className="h-3 w-12 mx-auto" />
        </div>
      ))}
    </div>
  )
}

export function CheatSheetCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-7 w-16 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
      <Skeleton className="h-20 rounded-lg" />
    </div>
  )
}

import React from 'react'
import { cn } from '@/lib/utils'

interface AnimatedGridProps {
  className?: string
}

export const AnimatedGrid: React.FC<AnimatedGridProps> = ({ className }) => {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 -z-10 h-full w-full',
        className
      )}
    >
      <div
        className="absolute inset-0 h-full w-full bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-60"
      />
    </div>
  )
}

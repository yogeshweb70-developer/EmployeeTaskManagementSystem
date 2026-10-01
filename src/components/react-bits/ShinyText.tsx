import React from 'react'
import { cn } from '@/lib/utils'

interface ShinyTextProps {
  text: string
  disabled?: boolean
  speed?: number
  className?: string
}

export const ShinyText: React.FC<ShinyTextProps> = ({
  text,
  disabled = false,
  speed = 5,
  className = '',
}) => {
  const animationDuration = `${speed}s`

  return (
    <span
      className={cn(
        'inline-block bg-clip-text text-transparent',
        !disabled && 'animate-shine',
        className
      )}
      style={{
        backgroundImage:
          'linear-gradient(120deg, rgba(15, 23, 42, 1) 0%, rgba(15, 23, 42, 1) 35%, rgba(59, 130, 246, 0.9) 50%, rgba(15, 23, 42, 1) 65%, rgba(15, 23, 42, 1) 100%)',
        backgroundSize: '200% 100%',
        animationDuration,
      }}
    >
      {text}
    </span>
  )
}

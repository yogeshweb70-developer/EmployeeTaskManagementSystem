import React, { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface BlurTextProps {
  text: string
  className?: string
  delay?: number
}

export const BlurText: React.FC<BlurTextProps> = ({
  text,
  className = '',
  delay = 50,
}) => {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  return (
    <span
      className={cn(
        'inline-block transition-all duration-700 ease-out',
        mounted
          ? 'blur-0 opacity-100 translate-y-0'
          : 'blur-xs opacity-0 translate-y-1',
        className
      )}
    >
      {text}
    </span>
  )
}

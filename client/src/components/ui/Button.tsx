import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'border border-amber-600 bg-amber-100 text-ink-900 hover:bg-amber-100/70',
  secondary: 'border border-hairline text-ink-700 hover:bg-paper-100 hover:text-ink-900',
  ghost: 'border border-transparent text-ink-700 hover:bg-paper-100 hover:text-ink-900',
  danger: 'border border-conflict/40 text-conflict hover:bg-conflict-tint',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-xs',
  md: 'min-h-11 px-4 text-sm',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
}

/**
 * The one button treatment used across every redesigned page — primary (the one amber CTA
 * per view), secondary (outline), ghost (text-only, lowest emphasis), danger (destructive
 * actions). Consistent hierarchy beats a different ad-hoc className on every page.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', isLoading = false, disabled, className = '', children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-pill font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      {isLoading && <Loader2 size={14} aria-hidden="true" className="animate-spin" />}
      {children}
    </button>
  )
})

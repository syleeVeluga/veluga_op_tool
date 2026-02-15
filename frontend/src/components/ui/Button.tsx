import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'outline' | 'ghost'
type ButtonSize = 'sm' | 'md'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
}

const baseClassName =
  'rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60'

const variantClassMap: Record<ButtonVariant, string> = {
  primary: 'bg-slate-900 text-white',
  outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100',
  ghost: 'text-slate-700 hover:bg-slate-100',
}

const sizeClassMap: Record<ButtonSize, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-2 text-sm',
}

export function Button({
  variant = 'outline',
  size = 'md',
  fullWidth = false,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        baseClassName,
        variantClassMap[variant],
        sizeClassMap[size],
        fullWidth ? 'w-full' : '',
        className ?? '',
      ]
        .join(' ')
        .trim()}
      {...props}
    />
  )
}

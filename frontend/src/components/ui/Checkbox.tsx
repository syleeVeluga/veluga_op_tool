import type { InputHTMLAttributes } from 'react'

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function Checkbox({ label, checked, onChange, disabled, className, ...props }: CheckboxProps) {
  return (
    <label
      className={[
        'flex cursor-pointer items-center gap-2 text-sm select-none',
        disabled ? 'cursor-not-allowed opacity-60' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-slate-900 disabled:cursor-not-allowed"
        {...props}
      />
      <span className="text-slate-700">{label}</span>
    </label>
  )
}

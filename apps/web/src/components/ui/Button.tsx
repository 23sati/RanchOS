import { cn } from '@/lib/utils/cn';
import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'theme-button-primary',
  secondary: 'theme-button-secondary border',
  destructive: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'theme-button-ghost',
  outline: 'theme-button-outline border',
} as const;

const SIZES = {
  sm: 'h-8 px-3 text-xs font-medium rounded-md gap-1.5',
  md: 'h-9 px-4 text-sm font-medium rounded-lg gap-2',
  lg: 'h-11 px-6 text-sm font-semibold rounded-lg gap-2',
  icon: 'h-9 w-9 p-0 rounded-lg',
} as const;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, children, className, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky/50',
        'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  )
);
Button.displayName = 'Button';

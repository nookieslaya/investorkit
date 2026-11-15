import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';
const variants = cva('inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 disabled:pointer-events-none disabled:opacity-50 min-h-11 px-4 py-2', {
  variants: { variant: { default: 'bg-primary text-primary-foreground hover:opacity-90', outline: 'border border-border bg-card text-foreground hover:bg-muted', ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground' } },
  defaultVariants: { variant: 'default' },
});
export function Button({ className, variant, asChild = false, ...props }: ComponentProps<'button'> & VariantProps<typeof variants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp data-slot="button" className={cn(variants({ variant }), className)} {...props} />;
}

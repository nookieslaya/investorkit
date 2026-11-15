// Adapted from shadcn/ui's New York Select registry (MIT), using Radix primitives.
// https://ui.shadcn.com/r/styles/new-york/select.json
import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;
export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return <SelectPrimitive.Trigger data-slot="select-trigger" className={cn('select-trigger', className)} {...props}>
    {children}<SelectPrimitive.Icon asChild><ChevronDown data-slot="select-chevron" size={16} aria-hidden="true" /></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>;
}
export function SelectContent({ className, children, position = 'popper', sideOffset = 6, ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  // The app theme lives on this element. Keep portalled menus inside its CSS variables
  // and data-theme scope rather than losing light/dark styling under document.body.
  useEffect(() => { setContainer(document.querySelector<HTMLElement>('.app-shell')); }, []);
  return <SelectPrimitive.Portal {...(container ? { container } : {})}>
    <SelectPrimitive.Content data-slot="select-content" position={position} sideOffset={sideOffset} collisionPadding={12} className={cn('select-content', className)} {...props}>
      <SelectScrollUpButton /><SelectPrimitive.Viewport className="select-viewport">{children}</SelectPrimitive.Viewport><SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>;
}
export function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return <SelectPrimitive.Item data-slot="select-item" className={cn('select-item', className)} {...props}>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <span className="select-indicator"><SelectPrimitive.ItemIndicator><Check size={16} aria-hidden="true" /></SelectPrimitive.ItemIndicator></span>
  </SelectPrimitive.Item>;
}
export function SelectLabel({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) {
  return <SelectPrimitive.Label className={cn('select-label', className)} {...props} />;
}
export function SelectSeparator({ className, ...props }: ComponentProps<typeof SelectPrimitive.Separator>) {
  return <SelectPrimitive.Separator className={cn('select-separator', className)} {...props} />;
}
export function SelectScrollUpButton({ className, ...props }: ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return <SelectPrimitive.ScrollUpButton className={cn('select-scroll', className)} {...props}><ChevronUp size={16} aria-hidden="true" /></SelectPrimitive.ScrollUpButton>;
}
export function SelectScrollDownButton({ className, ...props }: ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return <SelectPrimitive.ScrollDownButton className={cn('select-scroll', className)} {...props}><ChevronDown size={16} aria-hidden="true" /></SelectPrimitive.ScrollDownButton>;
}

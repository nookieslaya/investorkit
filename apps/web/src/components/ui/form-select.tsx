import { useId } from 'react';
import type { ComponentProps } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
interface FormSelectProps extends Pick<ComponentProps<typeof Select>, 'name' | 'value' | 'defaultValue' | 'onValueChange' | 'required' | 'disabled'> {
  label: string;
  placeholder?: string;
  options: readonly { value: string; label: string; disabled?: boolean }[];
}
export function FormSelect({ label, placeholder = 'Wybierz…', options, disabled, ...props }: FormSelectProps) {
  const id = useId();
  return <div className="select-field"><label htmlFor={id}>{label}</label>
    <Select {...props} disabled={disabled || options.length === 0}>
      <SelectTrigger id={id} aria-label={label}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
}

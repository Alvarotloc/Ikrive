import { type AriaAttributes, createContext, useContext } from 'react';

interface FormFieldContextValue {
  /** Id of the control the field's label points to. */
  controlId: string;
  /** Id of the rendered error message, or `undefined` when there is no error. */
  errorId: string | undefined;
}

export const FormFieldContext = createContext<FormFieldContextValue | null>(null);

interface FieldControlProps {
  id?: string | undefined;
  'aria-describedby'?: string | undefined;
  'aria-invalid'?: AriaAttributes['aria-invalid'];
}

/**
 * Links a control to the error of its enclosing `FormField`: when the field shows an error,
 * the control gets `aria-invalid` and the error id is appended to its own `aria-describedby`
 * (hints such as «Calculado» are kept). Only the control whose `id` matches the field's label
 * is linked, so other elements inside the field are left untouched.
 */
export function useFormFieldControl<P extends FieldControlProps>(props: P): P {
  const field = useContext(FormFieldContext);
  if (!field?.errorId || props.id !== field.controlId) return props;

  const describedBy = [props['aria-describedby'], field.errorId].filter(Boolean).join(' ');
  return { ...props, 'aria-describedby': describedBy, 'aria-invalid': true };
}

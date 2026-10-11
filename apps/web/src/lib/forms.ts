import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { ApiRequestError } from '@/lib/api';

/**
 * Puts an API error where the user will see it: field errors under their
 * inputs, anything else in the form-level alert (`errors.root.server`).
 */
export function applyServerError<T extends FieldValues>(
  form: Pick<UseFormReturn<T>, 'setError' | 'getValues'>,
  err: unknown,
) {
  if (!(err instanceof ApiRequestError)) {
    form.setError('root.server', {
      message: 'Couldn’t reach SPU Events. Check your connection and try again.',
    });
    return;
  }

  const known = Object.keys(form.getValues());
  let placed = false;
  for (const [field, messages] of Object.entries(err.error.fields ?? {})) {
    if (known.includes(field) && messages[0]) {
      form.setError(field as Path<T>, { message: messages[0] }, { shouldFocus: !placed });
      placed = true;
    }
  }
  if (!placed) form.setError('root.server', { message: err.error.message });
}

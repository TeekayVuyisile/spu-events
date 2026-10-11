import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@spu-events/shared';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { homeFor, safeNext, useLogin } from '@/lib/auth';
import { applyServerError } from '@/lib/forms';

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const login = useLogin();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const { user } = await login.mutateAsync(values);
      navigate(next ?? homeFor(user!.role), { replace: true });
    } catch (err) {
      applyServerError(form, err);
      form.resetField('password', { keepError: true });
    }
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold md:text-4xl">Welcome back</h1>
        <p className="text-muted-foreground">Log in to get tickets and manage your wallet.</p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormAlert message={errors.root?.server?.message} />

        <Field
          label="Student number or email"
          error={errors.identifier?.message}
          hint="Staff and admins use their email."
        >
          {(control) => (
            <Input
              {...control}
              {...form.register('identifier')}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
            />
          )}
        </Field>

        <Field label="Password" error={errors.password?.message}>
          {(control) => (
            <PasswordInput
              {...control}
              {...form.register('password')}
              autoComplete="current-password"
            />
          )}
        </Field>

        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          Log in
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        New to SPU Events?{' '}
        <Link
          to={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Create a student account
        </Link>
      </p>
    </div>
  );
}

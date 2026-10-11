import { zodResolver } from '@hookform/resolvers/zod';
import { PASSWORD_MIN, signupSchema, type SignupInput } from '@spu-events/shared';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { safeNext, useSignup } from '@/lib/auth';
import { applyServerError } from '@/lib/forms';

export function SignupPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const signup = useSignup();
  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { firstName: '', lastName: '', studentNumber: '', email: '', password: '' },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const { user } = await signup.mutateAsync(values);
      toast.success(`Welcome, ${user!.firstName}!`);
      navigate(next ?? '/', { replace: true });
    } catch (err) {
      applyServerError(form, err);
    }
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-extrabold md:text-4xl">Create your account</h1>
        <p className="text-muted-foreground">For SPU students. It takes under a minute.</p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormAlert message={errors.root?.server?.message} />

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="First name" error={errors.firstName?.message}>
            {(control) => (
              <Input {...control} {...form.register('firstName')} autoComplete="given-name" />
            )}
          </Field>
          <Field label="Last name" error={errors.lastName?.message}>
            {(control) => (
              <Input {...control} {...form.register('lastName')} autoComplete="family-name" />
            )}
          </Field>
        </div>

        <Field
          label="Student number"
          error={errors.studentNumber?.message}
          hint="The 9 digits on your student card."
        >
          {(control) => (
            <Input
              {...control}
              {...form.register('studentNumber')}
              inputMode="numeric"
              maxLength={9}
              autoComplete="username"
              className="tabular"
            />
          )}
        </Field>

        <Field label="Email" error={errors.email?.message}>
          {(control) => (
            <Input
              {...control}
              {...form.register('email')}
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
            />
          )}
        </Field>

        <Field
          label="Password"
          error={errors.password?.message}
          hint={`At least ${PASSWORD_MIN} characters. A short phrase is easiest to remember.`}
        >
          {(control) => (
            <PasswordInput
              {...control}
              {...form.register('password')}
              autoComplete="new-password"
            />
          )}
        </Field>

        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          Create account
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          to={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { acceptInviteSchema, PASSWORD_MIN, type InvitePreview } from '@monthati/shared';
import { useQuery } from '@tanstack/react-query';
import { Hourglass, Loader2, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormAlert } from '@/components/ui/form-alert';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { api } from '@/lib/api';
import { homeFor, roleLabel, useAcceptInvite } from '@/lib/auth';
import { applyServerError } from '@/lib/forms';

/** The confirmation only matters in the browser; the API takes the password alone. */
const formSchema = acceptInviteSchema
  .extend({ confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'The passwords don’t match',
  });
type FormValues = z.infer<typeof formSchema>;

export function InvitePage() {
  const { token = '' } = useParams();
  const preview = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api<{ invite: InvitePreview }>(`/invites/${encodeURIComponent(token)}`),
    staleTime: Infinity,
  });

  if (preview.isPending) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground" aria-live="polite">
        <Loader2 className="size-5 animate-spin" aria-hidden /> Checking your invite…
      </p>
    );
  }

  if (preview.isError) {
    return (
      <div className="space-y-6">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-warning/12 text-warning">
          <Hourglass className="size-6" aria-hidden />
        </span>
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold">This invite can’t be used</h1>
          <p className="text-muted-foreground">
            {preview.error.message}. Ask the admin who invited you to send a new link.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/login">Go to log in</Link>
        </Button>
      </div>
    );
  }

  return <AcceptForm token={token} invite={preview.data.invite} />;
}

function AcceptForm({ token, invite }: { token: string; invite: InvitePreview }) {
  const navigate = useNavigate();
  const accept = useAcceptInvite(token);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: '', confirm: '' },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    try {
      const { user } = await accept.mutateAsync({ password });
      toast.success(`Welcome to the team, ${user!.firstName}`);
      navigate(homeFor(user!.role), { replace: true });
    } catch (err) {
      applyServerError(form, err);
    }
  });

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Badge tone="primary">
          <ShieldCheck aria-hidden /> {roleLabel(invite.role)} invite
        </Badge>
        <h1 className="text-3xl font-extrabold md:text-4xl">
          Hi {invite.firstName}, set up your account
        </h1>
        <p className="text-muted-foreground">
          Choose a password to finish. You’ll log in with your email from now on.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormAlert message={errors.root?.server?.message} />

        <Field label="Email">
          {(control) => (
            <Input {...control} value={invite.email} readOnly autoComplete="username" />
          )}
        </Field>

        <Field
          label="Password"
          error={errors.password?.message}
          hint={`At least ${PASSWORD_MIN} characters.`}
        >
          {(control) => (
            <PasswordInput
              {...control}
              {...form.register('password')}
              autoComplete="new-password"
              autoFocus
            />
          )}
        </Field>

        <Field label="Confirm password" error={errors.confirm?.message}>
          {(control) => (
            <PasswordInput {...control} {...form.register('confirm')} autoComplete="new-password" />
          )}
        </Field>

        <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          Create account
        </Button>
      </form>
    </div>
  );
}

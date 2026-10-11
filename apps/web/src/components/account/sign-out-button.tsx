import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useLogout } from '@/lib/auth';

export function SignOutButton(props: Omit<ButtonProps, 'onClick' | 'loading'>) {
  const navigate = useNavigate();
  const logout = useLogout();

  return (
    <Button
      variant="outline"
      {...props}
      loading={logout.isPending}
      onClick={() =>
        logout.mutate(undefined, {
          onSuccess: () => navigate('/login', { replace: true }),
          onError: () => toast.error('Couldn’t sign out. Try again.'),
        })
      }
    >
      {!logout.isPending && <LogOut aria-hidden />}
      Sign out
    </Button>
  );
}

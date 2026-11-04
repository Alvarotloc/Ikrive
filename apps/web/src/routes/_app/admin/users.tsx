import { createFileRoute, redirect } from '@tanstack/react-router';
import { AdminUsersPage } from '@/features/admin-users/users-page';

export const Route = createFileRoute('/_app/admin/users')({
  // `me` comes from the `/_app` guard: a non-admin never renders the page nor asks for the list.
  beforeLoad: ({ context }) => {
    if (context.me.role !== 'admin') throw redirect({ to: '/' });
  },
  component: AdminUsersPage,
});

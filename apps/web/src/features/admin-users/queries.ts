import type { AdminUser, AdminUserRoleUpdate } from '@ikrive/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export const adminUsersQuery = queryOptions({
  queryKey: queryKeys.adminUsers,
  queryFn: () => api.get<AdminUser[]>('/admin/users'),
});

/**
 * Refreshes the whole list when the action settles: on success because it changes the locks of other
 * rows (e.g. the last admin), on error because a 409 means the list is out of date.
 */
function useAdminUserMutation<TVariables, TResult>(mutationFn: (variables: TVariables) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers }),
  });
}

export const useSetUserRole = () =>
  useAdminUserMutation(({ id, role }: { id: string } & AdminUserRoleUpdate) =>
    api.put<AdminUser>(`/admin/users/${id}/role`, { role }),
  );

export const useDisableUser = () =>
  useAdminUserMutation((id: string) => api.post<AdminUser>(`/admin/users/${id}/disable`));

export const useEnableUser = () =>
  useAdminUserMutation((id: string) => api.post<AdminUser>(`/admin/users/${id}/enable`));

export const useDeleteUser = () =>
  useAdminUserMutation((id: string) => api.delete<void>(`/admin/users/${id}`));

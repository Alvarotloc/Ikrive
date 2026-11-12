import type { AdminUserRoleUpdate } from '@ikrive/shared';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataSource } from '@/lib/data-source';
import { queryKeys } from '@/lib/query-keys';

export const adminUsersQuery = queryOptions({
  queryKey: queryKeys.adminUsers,
  queryFn: () => dataSource().adminUsers.list(),
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
    dataSource().adminUsers.setRole(id, role),
  );

export const useDisableUser = () => useAdminUserMutation((id: string) => dataSource().adminUsers.disable(id));

export const useEnableUser = () => useAdminUserMutation((id: string) => dataSource().adminUsers.enable(id));

export const useDeleteUser = () => useAdminUserMutation((id: string) => dataSource().adminUsers.remove(id));

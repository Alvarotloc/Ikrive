import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/page-header';
import { adminUsersQuery } from './queries';
import { UserRow } from './user-row';

/** `/admin/users`: every account of the instance, in the order of the API, with the admin actions. */
export function AdminUsersPage() {
  const { t } = useTranslation();
  const { data: users, isPending, isError } = useQuery(adminUsersQuery);

  return (
    <div className="grid gap-8">
      <PageHeader title={t('adminUsers.title')} description={t('adminUsers.description')} />
      {isPending ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : isError ? (
        <p className="text-sm text-destructive" role="alert">
          {t('adminUsers.loadError')}
        </p>
      ) : (
        <ul className="grid gap-3">
          {users.map((user) => (
            <UserRow key={user.id} user={user} />
          ))}
        </ul>
      )}
    </div>
  );
}

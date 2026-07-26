import { useQuery } from '@tanstack/react-query'
import { adminMe } from '@/features/admin/api/adminApi'

/** A 401 here just means "not logged in" — not a transient failure — so this never retries;
 * callers check `isError`/`isSuccess`, they never need the error thrown to a boundary. */
export function useAdminSession() {
  return useQuery({
    queryKey: ['admin-session'],
    queryFn: () => adminMe(),
    retry: false,
  })
}

import { useQuery } from '@tanstack/react-query'
import { fetchMe } from '@/features/auth/api/authApi'

export function useUserSession() {
  return useQuery({
    queryKey: ['user-session'],
    queryFn: () => fetchMe(),
    retry: false,
  })
}

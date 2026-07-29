/**
 * Authorization context for an AI conversation — decided entirely by which route the
 * request came in through (never by anything the model or the user says in chat). Mirrors
 * the two authorization boundaries that already exist for humans: the guest manage-token
 * routes and the requireAdminAuth admin routes (CLAUDE.md §17: "Never allow the model to
 * decide authorization").
 */
export type AiContext =
  | { mode: 'guest'; manageToken?: string }
  | { mode: 'admin' }
  // activeApplicationId is an optional UX hint only (e.g. the candidate opened the AI
  // assistant from a specific application's "Book with AI" button) — never an authorization
  // grant. Every tool that uses it still re-verifies ownership via getApplicationForCandidate
  // before touching anything, exactly as if the model had discovered the id itself through
  // find_bookable_interview_rounds/list_my_applications.
  | { mode: 'user'; userId: string; email: string; activeApplicationId?: string }
  | { mode: 'recruiter'; userId: string; email: string; companyId: string }

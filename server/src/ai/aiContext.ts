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

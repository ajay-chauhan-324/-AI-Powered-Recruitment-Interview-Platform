/**
 * A simple, transparent skill-overlap heuristic — deliberately NOT the real AI job-fit
 * score (that only exists once a candidate has actually applied and the backend's AI
 * pipeline has analyzed their resume against a specific job). This is labeled "skill
 * match" everywhere it appears, never "AI match" or "ATS score", so the two are never
 * confused: one is a real backend AI analysis, the other is client-side arithmetic over a
 * candidate's own listed skills vs. a job's required skills.
 */
export interface SkillOverlap {
  pct: number
  matched: string[]
  missing: string[]
}

export function computeSkillOverlap(candidateSkills: string[], jobSkills: string[]): SkillOverlap {
  const candidateLower = new Set(candidateSkills.map((skill) => skill.toLowerCase()))
  const matched = jobSkills.filter((skill) => candidateLower.has(skill.toLowerCase()))
  const missing = jobSkills.filter((skill) => !candidateLower.has(skill.toLowerCase()))
  const pct = jobSkills.length > 0 ? Math.round((matched.length / jobSkills.length) * 100) : 0
  return { pct, matched, missing }
}

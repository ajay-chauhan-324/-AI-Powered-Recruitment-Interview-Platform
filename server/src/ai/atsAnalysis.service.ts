import { z } from 'zod'
import { getAiProvider } from './providers/index.js'
import { AiProviderError, AiProviderNotConfiguredError, type AiMessage, type AiProvider } from './providers/types.js'

/**
 * The AI ATS/job-fit analysis pipeline — a one-shot structured-JSON call, not a
 * conversation. Reuses the same provider-agnostic AiProvider.complete() the chat assistant
 * uses (never a second AI plumbing layer), just with an empty tool list and a prompt that
 * demands JSON back. Every response is Zod-validated before it can reach the database or a
 * client — CLAUDE.md's AI principle: never let arbitrary AI output become authoritative
 * data.
 */

export const atsAnalysisResultSchema = z.object({
  score: z.number().min(0).max(100),
  confidence: z.enum(['low', 'medium', 'high']),
  matchedSkills: z.array(z.string()).max(30),
  missingSkills: z.array(z.string()).max(30),
  experienceMatch: z.string().max(500),
  educationMatch: z.string().max(500),
  strengths: z.array(z.string()).max(10),
  gaps: z.array(z.string()).max(10),
  recommendations: z.array(z.string()).max(10),
  evidence: z.array(z.string()).max(10),
})

export type AtsAnalysisResult = z.infer<typeof atsAnalysisResultSchema>

/** Thrown for any reason analysis couldn't be produced (provider down, malformed output
 * after retry, etc.) — callers (application.service.ts) must treat this as "analysis
 * unavailable right now", never as a reason to fail the application itself. */
export class AtsAnalysisUnavailableError extends Error {
  constructor(message = 'AI analysis is temporarily unavailable.') {
    super(message)
    this.name = 'AtsAnalysisUnavailableError'
  }
}

export interface AtsAnalysisJobInput {
  title: string
  description: string
  requiredSkills: string[]
  preferredSkills: string[]
  minExperienceYears: number
  experienceLevel: string
  educationRequirement: string
}

function buildPrompt(resumeText: string, job: AtsAnalysisJobInput): AiMessage[] {
  const system = [
    'You are an ATS (Applicant Tracking System) resume analysis engine for a recruitment platform.',
    'Compare the candidate resume text against the job requirements and return your analysis as a SINGLE JSON object — no markdown fences, no commentary, no text before or after the JSON.',
    'The JSON object must have exactly these keys:',
    '{ "score": number 0-100, "confidence": "low"|"medium"|"high", "matchedSkills": string[], "missingSkills": string[], "experienceMatch": string, "educationMatch": string, "strengths": string[], "gaps": string[], "recommendations": string[], "evidence": string[] }',
    'Base every claim only on what is actually present in the resume text — never invent experience, skills, or credentials the resume does not support. "evidence" should quote or closely paraphrase specific resume lines that justify the score.',
    'This analysis is advisory only — it estimates job fit, it does not decide eligibility.',
  ].join('\n')

  const user = [
    `Job title: ${job.title}`,
    `Experience level: ${job.experienceLevel}`,
    `Minimum experience (years): ${job.minExperienceYears}`,
    `Required skills: ${job.requiredSkills.join(', ') || 'none specified'}`,
    `Preferred skills: ${job.preferredSkills.join(', ') || 'none specified'}`,
    `Education requirement: ${job.educationRequirement || 'none specified'}`,
    `Job description: ${job.description || 'none provided'}`,
    '',
    'Candidate resume text:',
    resumeText || '(empty resume text)',
  ].join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

/** Free-tier models frequently wrap JSON in markdown code fences despite instructions not
 * to — strip those defensively before parsing rather than treating it as a hard failure. */
function extractJsonText(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  return fenced?.[1] ?? trimmed
}

async function requestAnalysis(provider: AiProvider, messages: AiMessage[]): Promise<AtsAnalysisResult> {
  const result = await provider.complete(messages, [])
  const jsonText = extractJsonText(result.content)
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(jsonText)
  } catch {
    throw new Error('AI response was not valid JSON.')
  }
  const validated = atsAnalysisResultSchema.safeParse(parsedJson)
  if (!validated.success) {
    throw new Error(`AI response did not match the expected shape: ${validated.error.issues.map((i) => i.message).join('; ')}`)
  }
  return validated.data
}

export async function analyzeResumeAgainstJob(
  resumeText: string,
  job: AtsAnalysisJobInput,
  provider: AiProvider = getAiProvider(),
): Promise<AtsAnalysisResult> {
  const messages = buildPrompt(resumeText, job)

  try {
    return await requestAnalysis(provider, messages)
  } catch (firstError) {
    if (firstError instanceof AiProviderNotConfiguredError || firstError instanceof AiProviderError) {
      throw new AtsAnalysisUnavailableError()
    }
    // One retry with an explicit correction nudge — cheaper than failing outright on a
    // model that almost got the shape right (e.g. wrapped in prose) the first time.
    try {
      return await requestAnalysis(provider, [
        ...messages,
        { role: 'assistant', content: '' },
        {
          role: 'user',
          content: 'Your previous response was not valid JSON matching the required shape. Respond with ONLY the JSON object, nothing else.',
        },
      ])
    } catch {
      throw new AtsAnalysisUnavailableError()
    }
  }
}

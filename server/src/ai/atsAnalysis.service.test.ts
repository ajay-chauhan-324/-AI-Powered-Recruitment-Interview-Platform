import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeResumeAgainstJob, AtsAnalysisUnavailableError } from './atsAnalysis.service.js'
import { AiProviderError, AiProviderNotConfiguredError, type AiCompletionResult, type AiMessage, type AiProvider, type AiToolDefinition } from './providers/types.js'

const JOB: Parameters<typeof analyzeResumeAgainstJob>[1] = {
  title: 'Backend Engineer',
  description: 'Build APIs.',
  requiredSkills: ['Node.js'],
  preferredSkills: ['AWS'],
  minExperienceYears: 3,
  experienceLevel: 'mid',
  educationRequirement: '',
}

const VALID_RESULT = {
  score: 80,
  confidence: 'high',
  matchedSkills: ['Node.js'],
  missingSkills: [],
  experienceMatch: 'meets requirement',
  educationMatch: 'not specified',
  strengths: ['Strong Node.js background'],
  gaps: [],
  recommendations: ['Add more detail on AWS'],
  evidence: ['5 years Node.js experience'],
}

class ScriptedProvider implements AiProvider {
  private readonly script: Array<AiCompletionResult | Error>
  private callCount = 0

  constructor(script: Array<AiCompletionResult | Error>) {
    this.script = script
  }

  async complete(_messages: AiMessage[], _tools: AiToolDefinition[]): Promise<AiCompletionResult> {
    const result = this.script[this.callCount]
    this.callCount += 1
    if (!result) throw new Error('ScriptedProvider ran out of scripted responses')
    if (result instanceof Error) throw result
    return result
  }
}

function textResult(content: string): AiCompletionResult {
  return { content, toolCalls: [] }
}

describe('ATS analysis pipeline', () => {
  it('returns a validated result when the provider responds with well-formed JSON', async () => {
    const provider = new ScriptedProvider([textResult(JSON.stringify(VALID_RESULT))])
    const result = await analyzeResumeAgainstJob('resume text', JOB, provider)
    assert.equal(result.score, 80)
    assert.deepEqual(result.matchedSkills, ['Node.js'])
  })

  it('strips markdown code fences before parsing', async () => {
    const provider = new ScriptedProvider([textResult('```json\n' + JSON.stringify(VALID_RESULT) + '\n```')])
    const result = await analyzeResumeAgainstJob('resume text', JOB, provider)
    assert.equal(result.score, 80)
  })

  it('retries once on malformed JSON, then succeeds', async () => {
    const provider = new ScriptedProvider([textResult('not json at all'), textResult(JSON.stringify(VALID_RESULT))])
    const result = await analyzeResumeAgainstJob('resume text', JOB, provider)
    assert.equal(result.score, 80)
  })

  it('throws AtsAnalysisUnavailableError if both attempts return malformed JSON', async () => {
    const provider = new ScriptedProvider([textResult('not json'), textResult('still not json')])
    await assert.rejects(() => analyzeResumeAgainstJob('resume text', JOB, provider), AtsAnalysisUnavailableError)
  })

  it('throws AtsAnalysisUnavailableError if the response does not match the required shape', async () => {
    const provider = new ScriptedProvider([
      textResult(JSON.stringify({ score: 'not-a-number' })),
      textResult(JSON.stringify({ score: 'still-not-a-number' })),
    ])
    await assert.rejects(() => analyzeResumeAgainstJob('resume text', JOB, provider), AtsAnalysisUnavailableError)
  })

  it('throws AtsAnalysisUnavailableError immediately (no retry) when the provider is not configured', async () => {
    const provider = new ScriptedProvider([new AiProviderNotConfiguredError()])
    await assert.rejects(() => analyzeResumeAgainstJob('resume text', JOB, provider), AtsAnalysisUnavailableError)
  })

  it('throws AtsAnalysisUnavailableError immediately (no retry) on a provider error', async () => {
    const provider = new ScriptedProvider([new AiProviderError('upstream down')])
    await assert.rejects(() => analyzeResumeAgainstJob('resume text', JOB, provider), AtsAnalysisUnavailableError)
  })
})

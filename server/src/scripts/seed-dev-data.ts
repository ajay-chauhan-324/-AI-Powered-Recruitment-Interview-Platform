import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { DateTime } from 'luxon'
import { connectDb, disconnectDb } from '../config/db.js'
import { UserModel } from '../models/User.model.js'
import { CompanyModel } from '../models/Company.model.js'
import { JobModel } from '../models/Job.model.js'
import { ApplicationModel, type ManualApplicationStatus } from '../models/Application.model.js'
import { ResumeModel } from '../models/Resume.model.js'
import { InterviewModel, type InterviewType } from '../models/Interview.model.js'
import { ScheduleConfigModel } from '../models/ScheduleConfig.model.js'
import { saveResumeFile, extractResumeText } from '../services/resume.service.js'
import { generateManageToken, rescheduleInterview } from '../services/interview.service.js'
import { upsertScheduleConfigForRecruiter } from '../services/scheduleConfig.service.js'
import {
  recordRoundOutcome,
  scheduleApplicationInterview,
  updateApplicationStatus,
} from '../services/application.service.js'

/**
 * Development-only realistic seed data — every account created here uses an
 * `@seed.dev` email address, which is exactly what `--remove` matches on to cleanly
 * delete everything this script created (and nothing else). Never run against a
 * production database.
 *
 * ATS analyses below are hand-authored, not produced by a live call to the AI provider —
 * a seed script must be fast, deterministic, and runnable with no AI provider configured at
 * all, which a real `analyzeResumeAgainstJob()` call cannot guarantee. The AI pipeline
 * itself already has dedicated test coverage (ai/atsAnalysis.service.test.ts) and was
 * exercised live in this project's manual QA — this script is only responsible for giving
 * the *frontend* realistic, varied content to render.
 *
 * Usage:
 *   npm run seed:dev          # create
 *   npm run seed:dev:remove   # remove everything this script created
 */

const SEED_EMAIL_DOMAIN = '@seed.dev'
const SEED_PASSWORD = 'seed-password-1'
const TIMEZONE = 'America/New_York'

function seedEmail(localPart: string): string {
  return `${localPart}${SEED_EMAIL_DOMAIN}`
}

async function ensureScheduleConfig(): Promise<void> {
  const existing = await ScheduleConfigModel.findOne({ singleton: 'default' })
  if (existing) return
  await ScheduleConfigModel.create({
    singleton: 'default',
    timezone: TIMEZONE,
    workingHours: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMinutes: 540, endMinutes: 1020, isActive: true })),
    breaks: [{ dayOfWeek: 1, startMinutes: 720, endMinutes: 780, label: 'Lunch' }],
    bufferMinutes: 15,
    minNoticeMinutes: 60,
    maxBookingWindowDays: 60,
  })
  console.log('  Created a default schedule config (none existed).')
}

/** Every recruitment-pipeline booking (scheduleApplicationInterview) now checks the owning
 * recruiter's OWN per-recruiter calendar (CLAUDE.md §36 second pivot), not the legacy
 * singleton `ensureScheduleConfig` sets up above — left unconfigured, a freshly-seeded
 * recruiter would only get the schema's fixed-pattern default (Asia/Kolkata 10:00-19:00),
 * which doesn't line up with this script's own TIMEZONE/hour assumptions
 * (nextWorkingWeekdayOffset/pastWorkingWeekdayOffset below all reason in America/New_York),
 * and every scheduleApplicationInterview call in runSeedSteps would spuriously conflict.
 * Mirrors ensureScheduleConfig's own pattern exactly, just scoped per recruiter. */
async function ensureRecruiterScheduleConfig(recruiterId: string): Promise<void> {
  await upsertScheduleConfigForRecruiter(recruiterId, {
    timezone: TIMEZONE,
    workingHours: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMinutes: 540, endMinutes: 1020, isActive: true })),
    breaks: [{ dayOfWeek: 1, startMinutes: 720, endMinutes: 780, label: 'Lunch' }],
    bufferMinutes: 15,
    minNoticeMinutes: 60,
    maxBookingWindowDays: 60,
  })
}

async function removeSeedData(): Promise<void> {
  const seedUsers = await UserModel.find({ email: { $regex: SEED_EMAIL_DOMAIN.replace('.', '\\.') + '$' } })
  const userIds = seedUsers.map((u) => u._id)

  const resumes = await ResumeModel.find({ userId: { $in: userIds } })
  for (const resume of resumes) {
    // Best-effort file cleanup — a missing file must never abort the removal.
    try {
      const { deleteResumeFile } = await import('../services/resume.service.js')
      await deleteResumeFile(resume.storageKey)
    } catch {
      // ignore
    }
  }

  await InterviewModel.deleteMany({ candidateEmail: { $regex: SEED_EMAIL_DOMAIN.replace('.', '\\.') + '$' } })
  await ApplicationModel.deleteMany({ candidateId: { $in: userIds } })
  await ResumeModel.deleteMany({ userId: { $in: userIds } })
  await JobModel.deleteMany({ recruiterId: { $in: userIds } })
  await CompanyModel.deleteMany({ recruiterId: { $in: userIds } })
  // Each seed recruiter gets its own per-recruiter ScheduleConfig (ensureRecruiterScheduleConfig
  // above) — since seed users are recreated with a fresh _id on every run, leaving these behind
  // would silently accumulate one orphaned document per recruiter on every re-seed.
  await ScheduleConfigModel.deleteMany({ recruiterId: { $in: userIds } })
  const result = await UserModel.deleteMany({ _id: { $in: userIds } })

  console.log(`Removed ${result.deletedCount} seed users and everything they owned.`)
}

interface RecruiterSeed {
  key: string
  name: string
  companyName: string
  industry: string
  size: string
  location: string
  description: string
}

const RECRUITERS: RecruiterSeed[] = [
  {
    key: 'technova',
    name: 'Elena Vasquez',
    companyName: 'TechNova Labs',
    industry: 'Developer Tools',
    size: '51-200',
    location: 'Remote (US)',
    description: 'TechNova Labs builds the developer tooling behind some of the web’s fastest-growing products — CI pipelines, edge runtimes, and the dashboards teams actually enjoy using.',
  },
  {
    key: 'pixelforge',
    name: 'Marcus Chen',
    companyName: 'PixelForge',
    industry: 'Design & Creative Software',
    size: '11-50',
    location: 'Austin, TX',
    description: 'PixelForge makes design-to-code tooling for product teams who ship fast without sacrificing craft.',
  },
  {
    key: 'cloudscale',
    name: 'Priya Nair',
    companyName: 'CloudScale',
    industry: 'Cloud Infrastructure',
    size: '201-500',
    location: 'Seattle, WA',
    description: 'CloudScale runs managed Kubernetes and observability infrastructure for mid-market SaaS companies.',
  },
  {
    key: 'brightlayer',
    name: 'Sam Okafor',
    companyName: 'BrightLayer AI',
    industry: 'Artificial Intelligence',
    size: '11-50',
    location: 'Remote (Global)',
    description: 'BrightLayer AI builds applied ML systems for enterprise document and decision workflows.',
  },
]

interface PipelineStageSeed {
  type: InterviewType
  title: string
  durationMinutes: number
}

interface JobSeed {
  recruiterKey: string
  title: string
  location: string
  workplaceType: 'remote' | 'hybrid' | 'onsite'
  employmentType: 'full_time' | 'part_time' | 'contract' | 'internship'
  experienceLevel: 'entry' | 'mid' | 'senior' | 'lead' | 'executive'
  minExperienceYears: number
  salaryMin: number
  salaryMax: number
  requiredSkills: string[]
  preferredSkills: string[]
  description: string
  responsibilities: string[]
  educationRequirement: string
  publishedDaysAgo: number
  /** The ordered interview pipeline every application to this job clones at apply-time
   * (CLAUDE.md's recruitment-pipeline spec) — always at least one stage, since a real job
   * can't publish without one (job.service.ts's publishJob). */
  pipeline: PipelineStageSeed[]
}

const JOBS: JobSeed[] = [
  {
    recruiterKey: 'technova',
    title: 'Senior Frontend Engineer',
    location: 'Remote (US)',
    workplaceType: 'remote',
    employmentType: 'full_time',
    experienceLevel: 'senior',
    minExperienceYears: 5,
    salaryMin: 140_000,
    salaryMax: 180_000,
    requiredSkills: ['React', 'TypeScript', 'CSS', 'Accessibility'],
    preferredSkills: ['Next.js', 'Design systems', 'Testing (Playwright/Vitest)'],
    description:
      'Own the frontend architecture for our developer dashboard, used daily by thousands of engineering teams. You will set technical direction for a small, senior frontend team.',
    responsibilities: [
      'Lead architecture decisions for a React/TypeScript codebase at scale',
      'Build and maintain our internal design system',
      'Mentor mid-level engineers and review architecture-level PRs',
      'Partner with design and product on complex, data-dense UI',
    ],
    educationRequirement: 'No specific degree required — we care about demonstrated experience.',
    publishedDaysAgo: 6,
    pipeline: [
      { type: 'behavioral', title: 'Behavioral Interview', durationMinutes: 30 },
      { type: 'technical', title: 'Technical Interview', durationMinutes: 60 },
      { type: 'coding', title: 'Coding Interview', durationMinutes: 90 },
    ],
  },
  {
    recruiterKey: 'pixelforge',
    title: 'Full Stack Developer',
    location: 'Austin, TX',
    workplaceType: 'hybrid',
    employmentType: 'full_time',
    experienceLevel: 'mid',
    minExperienceYears: 3,
    salaryMin: 110_000,
    salaryMax: 140_000,
    requiredSkills: ['Node.js', 'React', 'PostgreSQL'],
    preferredSkills: ['GraphQL', 'Docker'],
    description: 'Build features end-to-end across our design-to-code product, from the Postgres schema to the React UI.',
    responsibilities: [
      'Ship full-stack features across our Node.js API and React frontend',
      'Design and evolve PostgreSQL schemas as the product grows',
      'Participate in an on-call rotation for production issues',
    ],
    educationRequirement: '',
    publishedDaysAgo: 3,
    pipeline: [
      { type: 'hr_screening', title: 'HR Screening', durationMinutes: 30 },
      { type: 'technical', title: 'Technical Interview', durationMinutes: 60 },
      { type: 'system_design', title: 'System Design', durationMinutes: 60 },
    ],
  },
  {
    recruiterKey: 'cloudscale',
    title: 'Backend Engineer',
    location: 'Remote (US)',
    workplaceType: 'remote',
    employmentType: 'full_time',
    experienceLevel: 'senior',
    minExperienceYears: 4,
    salaryMin: 130_000,
    salaryMax: 165_000,
    requiredSkills: ['Go', 'Kubernetes', 'gRPC'],
    preferredSkills: ['PostgreSQL', 'Observability (Prometheus/Grafana)'],
    description: 'Build the control-plane services behind our managed Kubernetes platform, used by hundreds of production clusters.',
    responsibilities: [
      'Design and operate Go microservices on our Kubernetes control plane',
      'Improve reliability and observability of core infrastructure services',
      'Participate in architecture reviews for new platform capabilities',
    ],
    educationRequirement: '',
    publishedDaysAgo: 10,
    pipeline: [
      { type: 'hr_screening', title: 'HR Screening', durationMinutes: 30 },
      { type: 'technical', title: 'Technical Interview', durationMinutes: 60 },
      { type: 'system_design', title: 'System Design', durationMinutes: 60 },
    ],
  },
  {
    recruiterKey: 'brightlayer',
    title: 'AI Engineer',
    location: 'Remote (Global)',
    workplaceType: 'remote',
    employmentType: 'full_time',
    experienceLevel: 'senior',
    minExperienceYears: 4,
    salaryMin: 150_000,
    salaryMax: 200_000,
    requiredSkills: ['Python', 'PyTorch', 'LLMs'],
    preferredSkills: ['RAG pipelines', 'Vector databases', 'MLOps'],
    description: 'Build applied ML systems that extract structured decisions from unstructured enterprise documents.',
    responsibilities: [
      'Design and productionize LLM-based document understanding pipelines',
      'Evaluate and fine-tune models against real enterprise datasets',
      'Own model quality and latency in production',
    ],
    educationRequirement: 'BSc/MSc in Computer Science, ML, or a related field preferred.',
    publishedDaysAgo: 2,
    pipeline: [
      { type: 'hr_screening', title: 'HR Screening', durationMinutes: 30 },
      { type: 'technical', title: 'Technical Interview', durationMinutes: 60 },
      { type: 'final', title: 'Final Interview', durationMinutes: 45 },
    ],
  },
  {
    recruiterKey: 'pixelforge',
    title: 'Product Designer',
    location: 'San Francisco, CA',
    workplaceType: 'onsite',
    employmentType: 'full_time',
    experienceLevel: 'mid',
    minExperienceYears: 3,
    salaryMin: 100_000,
    salaryMax: 130_000,
    requiredSkills: ['Figma', 'Design systems', 'Interaction design'],
    preferredSkills: ['Motion design', 'User research'],
    description: 'Shape the core design-to-code editing experience used by thousands of product teams every day.',
    responsibilities: [
      'Design end-to-end flows for our core editing product',
      'Maintain and evolve our component-based design system',
      'Partner closely with engineering on implementation feasibility',
    ],
    educationRequirement: '',
    publishedDaysAgo: 8,
    pipeline: [
      { type: 'hr_screening', title: 'HR Screening', durationMinutes: 30 },
      { type: 'custom', title: 'Portfolio Review', durationMinutes: 45 },
      { type: 'final', title: 'Final Interview', durationMinutes: 30 },
    ],
  },
  {
    recruiterKey: 'technova',
    title: 'React Native Developer',
    location: 'Remote (US)',
    workplaceType: 'remote',
    employmentType: 'full_time',
    experienceLevel: 'mid',
    minExperienceYears: 3,
    salaryMin: 115_000,
    salaryMax: 145_000,
    requiredSkills: ['React Native', 'TypeScript'],
    preferredSkills: ['Native modules (iOS/Android)', 'CI/CD for mobile'],
    description: 'Build and maintain the companion mobile app for our developer dashboard product.',
    responsibilities: [
      'Ship features across our React Native iOS/Android app',
      'Own release quality and crash-free-rate metrics',
      'Collaborate with the web frontend team on shared design language',
    ],
    educationRequirement: '',
    publishedDaysAgo: 15,
    pipeline: [
      { type: 'hr_screening', title: 'HR Screening', durationMinutes: 30 },
      { type: 'technical', title: 'Technical Interview', durationMinutes: 60 },
      { type: 'final', title: 'Final Interview', durationMinutes: 30 },
    ],
  },
  {
    recruiterKey: 'cloudscale',
    title: 'DevOps Engineer',
    location: 'Seattle, WA',
    workplaceType: 'hybrid',
    employmentType: 'full_time',
    experienceLevel: 'senior',
    minExperienceYears: 4,
    salaryMin: 135_000,
    salaryMax: 170_000,
    requiredSkills: ['AWS', 'Terraform', 'CI/CD'],
    preferredSkills: ['Kubernetes', 'Security hardening'],
    description: 'Own the infrastructure-as-code and deployment pipelines behind our managed cloud platform.',
    responsibilities: [
      'Design and maintain Terraform modules for multi-account AWS infrastructure',
      'Build and improve CI/CD pipelines used by every engineering team',
      'Lead incident response for infrastructure-level issues',
    ],
    educationRequirement: '',
    publishedDaysAgo: 4,
    pipeline: [
      { type: 'hr_screening', title: 'HR Screening', durationMinutes: 30 },
      { type: 'technical', title: 'Technical Interview', durationMinutes: 60 },
      { type: 'final', title: 'Final Interview', durationMinutes: 30 },
    ],
  },
]

interface CandidateSeed {
  key: string
  name: string
  headline: string
  location: string
  skills: string[]
  experienceLevel: 'entry' | 'mid' | 'senior' | 'lead' | 'executive'
  resumeText: string
}

const CANDIDATES: CandidateSeed[] = [
  {
    key: 'jordan-ellis',
    name: 'Jordan Ellis',
    headline: 'Senior Frontend Engineer',
    location: 'Brooklyn, NY',
    skills: ['React', 'TypeScript', 'CSS', 'Accessibility', 'Next.js', 'Design systems', 'Testing'],
    experienceLevel: 'senior',
    resumeText:
      'Jordan Ellis — Senior Frontend Engineer, 7 years experience.\nExpert in React, TypeScript, and CSS architecture at scale. Built and led adoption of a company-wide design system used by 40+ engineers. Deep accessibility (WCAG AA) expertise across every project. Strong background in Next.js and automated testing with Playwright and Vitest. Mentored 5 mid-level engineers.',
  },
  {
    key: 'priya-kapoor',
    name: 'Priya Kapoor',
    headline: 'Frontend Engineer',
    location: 'Chicago, IL',
    skills: ['React', 'TypeScript', 'CSS', 'Next.js', 'Redux'],
    experienceLevel: 'senior',
    resumeText:
      'Priya Kapoor — Frontend Engineer, 6 years experience.\nStrong React and TypeScript background, shipped multiple production Next.js applications. Solid CSS and component architecture skills. Some exposure to accessibility auditing but not a primary focus. Limited automated testing experience — mostly manual QA in past roles.',
  },
  {
    key: 'marco-rossi',
    name: 'Marco Rossi',
    headline: 'Full Stack Developer',
    location: 'Denver, CO',
    skills: ['React', 'Node.js', 'PostgreSQL', 'JavaScript'],
    experienceLevel: 'mid',
    resumeText:
      'Marco Rossi — Full Stack Developer, 4 years experience.\nComfortable across the stack: Node.js APIs, PostgreSQL schemas, and React frontends. Frontend work has mostly been feature-level, not architecture-level. No TypeScript in production yet, primarily JavaScript. Basic CSS skills, relies on component libraries.',
  },
  {
    key: 'aisha-rahman',
    name: 'Aisha Rahman',
    headline: 'Backend-Leaning Software Engineer',
    location: 'Remote (US)',
    skills: ['Node.js', 'PostgreSQL', 'Go', 'Kubernetes', 'React (basic)'],
    experienceLevel: 'mid',
    resumeText:
      'Aisha Rahman — Software Engineer, 5 years experience.\nPrimarily backend-focused: Node.js and Go services, PostgreSQL, and Kubernetes deployment. Basic/introductory React experience from a bootcamp and one small internal tool — no production frontend ownership. Comfortable with infrastructure and deployment pipelines.',
  },
  {
    key: 'tom-baker',
    name: 'Tom Baker',
    headline: 'Junior Web Developer',
    location: 'Remote (US)',
    skills: ['HTML', 'CSS', 'JavaScript', 'jQuery'],
    experienceLevel: 'entry',
    resumeText:
      'Tom Baker — Junior Web Developer, 1 year experience.\nBuilt small marketing websites using HTML, CSS, JavaScript, and jQuery. Currently learning React through self-study and small personal projects — no production React experience. Eager to grow into a modern frontend role.',
  },
  {
    key: 'wei-zhang',
    name: 'Wei Zhang',
    headline: 'Full Stack Developer',
    location: 'Remote (US)',
    skills: ['Node.js', 'React', 'PostgreSQL', 'GraphQL', 'Docker'],
    experienceLevel: 'mid',
    resumeText:
      'Wei Zhang — Full Stack Developer, 4 years experience.\nShipped full-stack features across Node.js/GraphQL APIs and React frontends. Strong PostgreSQL schema design experience. Comfortable with Docker-based local development and deployment. Some backend infrastructure exposure.',
  },
  {
    key: 'lucas-meyer',
    name: 'Lucas Meyer',
    headline: 'Backend Engineer',
    location: 'Remote (EU)',
    skills: ['Go', 'Kubernetes', 'gRPC', 'PostgreSQL', 'Observability'],
    experienceLevel: 'senior',
    resumeText:
      'Lucas Meyer — Backend Engineer, 6 years experience.\nDeep Go and Kubernetes expertise, built gRPC-based microservices for a Series C infrastructure startup. Strong observability background with Prometheus and Grafana. Comfortable owning control-plane reliability end-to-end.',
  },
  {
    key: 'fatima-alsayed',
    name: 'Fatima Al-Sayed',
    headline: 'Machine Learning Engineer',
    location: 'Remote (Global)',
    skills: ['Python', 'PyTorch', 'LLMs', 'RAG pipelines', 'Vector databases'],
    experienceLevel: 'senior',
    resumeText:
      'Fatima Al-Sayed — Machine Learning Engineer, 5 years experience.\nBuilt production LLM-based document understanding pipelines using PyTorch and retrieval-augmented generation. Deep experience with vector databases and evaluation frameworks for enterprise ML systems. MSc in Computer Science.',
  },
  {
    key: 'grace-kim',
    name: 'Grace Kim',
    headline: 'Product Designer',
    location: 'San Francisco, CA',
    skills: ['Figma', 'Design systems', 'Interaction design', 'User research'],
    experienceLevel: 'mid',
    resumeText:
      'Grace Kim — Product Designer, 4 years experience.\nDesigned end-to-end product flows and maintained a component-based design system in Figma. Regularly runs user research to validate design decisions. Strong interaction design portfolio across web and mobile.',
  },
  {
    key: 'diego-fernandez',
    name: 'Diego Fernandez',
    headline: 'Mobile Engineer',
    location: 'Mexico City, Mexico',
    skills: ['React Native', 'TypeScript', 'iOS', 'Android'],
    experienceLevel: 'mid',
    resumeText:
      'Diego Fernandez — Mobile Engineer, 4 years experience.\nShipped and maintained React Native apps on iOS and Android, including native module integration. Strong TypeScript background. Owns release process and crash-free-rate metrics at current role.',
  },
  {
    key: 'olivia-bennett',
    name: 'Olivia Bennett',
    headline: 'DevOps / Platform Engineer',
    location: 'Seattle, WA',
    skills: ['AWS', 'Terraform', 'CI/CD', 'Kubernetes'],
    experienceLevel: 'senior',
    resumeText:
      'Olivia Bennett — DevOps Engineer, 6 years experience.\nDesigned multi-account AWS infrastructure with Terraform and built CI/CD pipelines used by 15+ engineering teams. Led incident response for infrastructure-level outages. Kubernetes experience from a prior platform role.',
  },
  {
    key: 'noah-whitfield',
    name: 'Noah Whitfield',
    headline: 'Software Engineer',
    location: 'Remote (US)',
    skills: ['JavaScript', 'Node.js', 'Python', 'AWS (basic)'],
    experienceLevel: 'mid',
    resumeText:
      'Noah Whitfield — Software Engineer, 3 years experience.\nGeneralist background across small startups: Node.js services, some Python scripting, and basic AWS deployment. Broad but not deep in any single area yet — open to backend, DevOps, or full-stack roles.',
  },
]

interface AtsSeed {
  score: number
  confidence: 'low' | 'medium' | 'high'
  matchedSkills: string[]
  missingSkills: string[]
  experienceMatch: string
  educationMatch: string
  strengths: string[]
  gaps: string[]
  recommendations: string[]
  evidence: string[]
}

/**
 * Each step reuses the SAME authoritative service function a real recruiter/candidate action
 * would call (application.service.ts / interview.service.ts) — never a hand-rolled duplicate
 * of the round-progression FSM. The one exception is 'completePast': createInterview()
 * deliberately rejects a past startAt (CLAUDE.md: no booking in the past), so a completed
 * historical round is inserted directly, exactly the way it would look after a real
 * interview's time had simply passed — then recordRoundOutcome still does the real
 * status-transition work.
 */
type SeedStep =
  | { action: 'setStatus'; status: ManualApplicationStatus }
  | { action: 'bookUpcoming'; daysFromNow: number }
  | { action: 'reschedule'; daysFromNow: number }
  | { action: 'completePast'; daysAgo: number; outcome: 'passed' | 'failed' }

interface ApplicationSeed {
  candidateKey: string
  jobTitle: string
  ats: AtsSeed
  steps: SeedStep[]
}

const APPLICATIONS: ApplicationSeed[] = [
  // Senior Frontend Engineer @ TechNova — the showcase job with a clear score spread.
  {
    candidateKey: 'jordan-ellis',
    jobTitle: 'Senior Frontend Engineer',
    steps: [{ action: 'setStatus', status: 'under_review' }],
    ats: {
      score: 96,
      confidence: 'high',
      matchedSkills: ['React', 'TypeScript', 'CSS', 'Accessibility'],
      missingSkills: [],
      experienceMatch: '7 years of experience well exceeds the 5-year senior-level requirement.',
      educationMatch: 'No specific degree required — not applicable.',
      strengths: [
        'Led company-wide design system adoption across 40+ engineers',
        'Deep, hands-on WCAG AA accessibility experience — a required skill, rarely this strong',
        'Mentorship experience aligns with senior-level expectations',
      ],
      gaps: ['No explicit mention of Next.js in a production capacity, though preferred, not required'],
      recommendations: ['Confirm current availability and compensation expectations — this is an exceptionally strong fit.'],
      evidence: ['Built and led adoption of a company-wide design system used by 40+ engineers', 'Deep accessibility (WCAG AA) expertise across every project'],
    },
  },
  {
    candidateKey: 'priya-kapoor',
    jobTitle: 'Senior Frontend Engineer',
    steps: [{ action: 'setStatus', status: 'shortlisted' }],
    ats: {
      score: 91,
      confidence: 'high',
      matchedSkills: ['React', 'TypeScript', 'CSS', 'Next.js'],
      missingSkills: ['Accessibility (dedicated experience)'],
      experienceMatch: '6 years of experience meets the 5-year senior-level requirement.',
      educationMatch: 'No specific degree required — not applicable.',
      strengths: ['Multiple production Next.js applications shipped', 'Strong React/TypeScript fundamentals'],
      gaps: ['Accessibility work described as auditing only, not a primary strength', 'Limited automated testing experience'],
      recommendations: ['Ask about hands-on accessibility experience and testing practices in the interview.'],
      evidence: ['Shipped multiple production Next.js applications', 'Some exposure to accessibility auditing but not a primary focus'],
    },
  },
  {
    candidateKey: 'marco-rossi',
    jobTitle: 'Senior Frontend Engineer',
    steps: [],
    ats: {
      score: 84,
      confidence: 'medium',
      matchedSkills: ['React'],
      missingSkills: ['TypeScript (production)', 'Accessibility'],
      experienceMatch: '4 years is below the 5-year senior-level requirement, though full-stack breadth is a plus.',
      educationMatch: 'No specific degree required — not applicable.',
      strengths: ['Comfortable across the full stack, not just frontend', 'Real production React experience'],
      gaps: ['No production TypeScript experience yet', 'Frontend work has been feature-level, not architecture-level'],
      recommendations: ['Could be a strong fit for a more mid-level frontend role, or with a TypeScript ramp-up plan.'],
      evidence: ['No TypeScript in production yet, primarily JavaScript', 'Frontend work has mostly been feature-level, not architecture-level'],
    },
  },
  {
    candidateKey: 'aisha-rahman',
    jobTitle: 'Senior Frontend Engineer',
    steps: [{ action: 'setStatus', status: 'rejected' }],
    ats: {
      score: 72,
      confidence: 'medium',
      matchedSkills: [],
      missingSkills: ['React (production)', 'TypeScript', 'CSS', 'Accessibility'],
      experienceMatch: '5 years of overall experience, but not in frontend-focused roles.',
      educationMatch: 'No specific degree required — not applicable.',
      strengths: ['Strong backend and infrastructure engineering background', 'Demonstrated ownership of production systems'],
      gaps: ['No production frontend experience — React limited to one small internal tool', 'No CSS or accessibility experience described'],
      recommendations: ['A better fit for backend or infrastructure roles than this frontend position.'],
      evidence: ['Basic/introductory React experience from a bootcamp and one small internal tool — no production frontend ownership'],
    },
  },
  {
    candidateKey: 'tom-baker',
    jobTitle: 'Senior Frontend Engineer',
    steps: [{ action: 'setStatus', status: 'rejected' }],
    ats: {
      score: 58,
      confidence: 'low',
      matchedSkills: ['CSS'],
      missingSkills: ['React (production)', 'TypeScript', 'Accessibility'],
      experienceMatch: '1 year of experience is well below the 5-year senior-level requirement.',
      educationMatch: 'No specific degree required — not applicable.',
      strengths: ['Foundational HTML/CSS/JavaScript skills', 'Actively self-studying React'],
      gaps: ['No production React experience', 'Seniority level significantly below requirement'],
      recommendations: ['Consider for a junior or entry-level frontend opening instead, once React experience is more established.'],
      evidence: ['Currently learning React through self-study and small personal projects — no production React experience'],
    },
  },
  // Full Stack Developer @ PixelForge
  {
    candidateKey: 'wei-zhang',
    jobTitle: 'Full Stack Developer',
    steps: [
      { action: 'setStatus', status: 'shortlisted' },
      { action: 'bookUpcoming', daysFromNow: 3 },
      { action: 'reschedule', daysFromNow: 6 },
    ],
    ats: {
      score: 89,
      confidence: 'high',
      matchedSkills: ['Node.js', 'React', 'PostgreSQL'],
      missingSkills: ['GraphQL (production)'],
      experienceMatch: '4 years meets the 3-year mid-level requirement.',
      educationMatch: 'Not specified — not applicable.',
      strengths: ['Full-stack ownership across Node.js/GraphQL APIs and React frontends', 'Strong PostgreSQL schema design experience'],
      gaps: ['GraphQL described as "some exposure" rather than deep ownership'],
      recommendations: ['Strong candidate — proceed to interview.'],
      evidence: ['Shipped full-stack features across Node.js/GraphQL APIs and React frontends'],
    },
  },
  {
    candidateKey: 'marco-rossi',
    jobTitle: 'Full Stack Developer',
    steps: [{ action: 'setStatus', status: 'under_review' }],
    ats: {
      score: 80,
      confidence: 'medium',
      matchedSkills: ['Node.js', 'React', 'PostgreSQL'],
      missingSkills: [],
      experienceMatch: '4 years meets the 3-year mid-level requirement.',
      educationMatch: 'Not specified — not applicable.',
      strengths: ['Full stack breadth matches this role well', 'Direct PostgreSQL experience'],
      gaps: ['No TypeScript experience — role uses a JavaScript/TypeScript mixed codebase'],
      recommendations: ['Good fit — worth a screening call.'],
      evidence: ['Comfortable across the stack: Node.js APIs, PostgreSQL schemas, and React frontends'],
    },
  },
  {
    candidateKey: 'noah-whitfield',
    jobTitle: 'Full Stack Developer',
    steps: [],
    ats: {
      score: 75,
      confidence: 'low',
      matchedSkills: ['Node.js'],
      missingSkills: ['React (production)', 'PostgreSQL'],
      experienceMatch: '3 years meets the minimum but breadth is generalist, not full-stack-specific.',
      educationMatch: 'Not specified — not applicable.',
      strengths: ['Adaptable generalist background', 'Comfortable picking up new stacks quickly at small startups'],
      gaps: ['No dedicated React or PostgreSQL experience described'],
      recommendations: ['Possible fit if the team can support ramp-up time on the frontend and database layers.'],
      evidence: ['Generalist background across small startups: Node.js services, some Python scripting, and basic AWS deployment'],
    },
  },
  // Backend Engineer @ CloudScale
  {
    candidateKey: 'lucas-meyer',
    jobTitle: 'Backend Engineer',
    steps: [{ action: 'setStatus', status: 'shortlisted' }],
    ats: {
      score: 93,
      confidence: 'high',
      matchedSkills: ['Go', 'Kubernetes', 'gRPC'],
      missingSkills: [],
      experienceMatch: '6 years exceeds the 4-year senior-level requirement.',
      educationMatch: 'Not specified — not applicable.',
      strengths: ['Deep Go and Kubernetes expertise at a comparable infrastructure company', 'Direct gRPC microservices experience', 'Strong observability background'],
      gaps: [],
      recommendations: ['Excellent match — move to interview promptly.'],
      evidence: ['Deep Go and Kubernetes expertise, built gRPC-based microservices for a Series C infrastructure startup'],
    },
  },
  {
    candidateKey: 'aisha-rahman',
    jobTitle: 'Backend Engineer',
    steps: [{ action: 'setStatus', status: 'shortlisted' }],
    ats: {
      score: 85,
      confidence: 'medium',
      matchedSkills: ['Go', 'Kubernetes'],
      missingSkills: ['gRPC'],
      experienceMatch: '5 years exceeds the 4-year senior-level requirement.',
      educationMatch: 'Not specified — not applicable.',
      strengths: ['Solid Go and Kubernetes deployment experience', 'Comfortable with infrastructure and pipelines'],
      gaps: ['No gRPC experience explicitly mentioned'],
      recommendations: ['Strong candidate — confirm gRPC familiarity or willingness to ramp up during screening.'],
      evidence: ['Primarily backend-focused: Node.js and Go services, PostgreSQL, and Kubernetes deployment'],
    },
  },
  {
    candidateKey: 'noah-whitfield',
    jobTitle: 'Backend Engineer',
    steps: [],
    ats: {
      score: 68,
      confidence: 'low',
      matchedSkills: [],
      missingSkills: ['Go', 'Kubernetes', 'gRPC'],
      experienceMatch: '3 years is below the 4-year senior-level requirement.',
      educationMatch: 'Not specified — not applicable.',
      strengths: ['Generalist backend exposure via Node.js and Python'],
      gaps: ['No Go, Kubernetes, or gRPC experience described', 'Below the required seniority level'],
      recommendations: ['Not a strong fit for this senior role as currently written.'],
      evidence: ['Generalist background across small startups: Node.js services, some Python scripting, and basic AWS deployment'],
    },
  },
  // AI Engineer @ BrightLayer AI
  {
    candidateKey: 'fatima-alsayed',
    jobTitle: 'AI Engineer',
    // The one showcase candidate who completes the entire pipeline — every round unlocked,
    // interviewed, and passed, ending in 'selected'.
    steps: [
      { action: 'setStatus', status: 'shortlisted' },
      { action: 'completePast', daysAgo: 12, outcome: 'passed' },
      { action: 'completePast', daysAgo: 7, outcome: 'passed' },
      { action: 'completePast', daysAgo: 2, outcome: 'passed' },
    ],
    ats: {
      score: 95,
      confidence: 'high',
      matchedSkills: ['Python', 'PyTorch', 'LLMs', 'RAG pipelines', 'Vector databases'],
      missingSkills: [],
      experienceMatch: '5 years meets the 4-year senior-level requirement.',
      educationMatch: 'MSc in Computer Science satisfies the preferred education requirement.',
      strengths: ['Production LLM document understanding pipeline experience — directly relevant', 'Deep RAG and vector database expertise'],
      gaps: [],
      recommendations: ['Outstanding match across every required and preferred skill.'],
      evidence: ['Built production LLM-based document understanding pipelines using PyTorch and retrieval-augmented generation'],
    },
  },
  {
    candidateKey: 'lucas-meyer',
    jobTitle: 'AI Engineer',
    steps: [
      { action: 'setStatus', status: 'shortlisted' },
      { action: 'completePast', daysAgo: 4, outcome: 'failed' },
    ],
    ats: {
      score: 55,
      confidence: 'medium',
      matchedSkills: [],
      missingSkills: ['Python', 'PyTorch', 'LLMs'],
      experienceMatch: '6 years of experience, but entirely in a different domain (infrastructure, not ML).',
      educationMatch: 'Not specified — not applicable.',
      strengths: ['Strong general software engineering fundamentals'],
      gaps: ['No Python, PyTorch, or ML experience described at all'],
      recommendations: ['Not a fit for this ML-focused role — consider for infrastructure roles instead.'],
      evidence: ['Deep Go and Kubernetes expertise, built gRPC-based microservices for a Series C infrastructure startup'],
    },
  },
  // Product Designer @ PixelForge
  {
    candidateKey: 'grace-kim',
    jobTitle: 'Product Designer',
    steps: [{ action: 'setStatus', status: 'shortlisted' }],
    ats: {
      score: 90,
      confidence: 'high',
      matchedSkills: ['Figma', 'Design systems', 'Interaction design', 'User research'],
      missingSkills: [],
      experienceMatch: '4 years meets the 3-year mid-level requirement.',
      educationMatch: 'Not specified — not applicable.',
      strengths: ['End-to-end product design ownership', 'Direct design system maintenance experience', 'Regular user research practice'],
      gaps: [],
      recommendations: ['Excellent match — move forward.'],
      evidence: ['Designed end-to-end product flows and maintained a component-based design system in Figma'],
    },
  },
  // React Native Developer @ TechNova
  {
    candidateKey: 'diego-fernandez',
    jobTitle: 'React Native Developer',
    steps: [
      { action: 'setStatus', status: 'shortlisted' },
      { action: 'bookUpcoming', daysFromNow: 5 },
    ],
    ats: {
      score: 92,
      confidence: 'high',
      matchedSkills: ['React Native', 'TypeScript'],
      missingSkills: [],
      experienceMatch: '4 years meets the 3-year mid-level requirement.',
      educationMatch: 'Not specified — not applicable.',
      strengths: ['Direct native module integration experience on iOS and Android', 'Owns release process and crash-free-rate metrics'],
      gaps: [],
      recommendations: ['Strong match — proceed to interview.'],
      evidence: ['Shipped and maintained React Native apps on iOS and Android, including native module integration'],
    },
  },
  {
    candidateKey: 'jordan-ellis',
    jobTitle: 'React Native Developer',
    steps: [],
    ats: {
      score: 70,
      confidence: 'low',
      matchedSkills: ['TypeScript'],
      missingSkills: ['React Native'],
      experienceMatch: '7 years of overall experience, but no mobile-specific experience.',
      educationMatch: 'Not specified — not applicable.',
      strengths: ['Strong TypeScript fundamentals transfer well'],
      gaps: ['No React Native or native mobile experience described'],
      recommendations: ['A strong engineer, but not an obvious fit for this mobile-specific role without ramp-up time.'],
      evidence: ['Expert in React, TypeScript, and CSS architecture at scale'],
    },
  },
  // DevOps Engineer @ CloudScale
  {
    candidateKey: 'olivia-bennett',
    jobTitle: 'DevOps Engineer',
    steps: [
      { action: 'setStatus', status: 'shortlisted' },
      { action: 'completePast', daysAgo: 2, outcome: 'passed' },
    ],
    ats: {
      score: 94,
      confidence: 'high',
      matchedSkills: ['AWS', 'Terraform', 'CI/CD'],
      missingSkills: [],
      experienceMatch: '6 years meets the 4-year senior-level requirement.',
      educationMatch: 'Not specified — not applicable.',
      strengths: ['Multi-account AWS + Terraform experience at meaningful scale', 'Led incident response for infrastructure outages'],
      gaps: [],
      recommendations: ['Excellent match across every required skill.'],
      evidence: ['Designed multi-account AWS infrastructure with Terraform and built CI/CD pipelines used by 15+ engineering teams'],
    },
  },
  {
    candidateKey: 'noah-whitfield',
    jobTitle: 'DevOps Engineer',
    steps: [],
    ats: {
      score: 62,
      confidence: 'low',
      matchedSkills: [],
      missingSkills: ['AWS (production)', 'Terraform', 'CI/CD'],
      experienceMatch: '3 years is below the 4-year senior-level requirement.',
      educationMatch: 'Not specified — not applicable.',
      strengths: ['Some basic AWS deployment exposure'],
      gaps: ['No Terraform or CI/CD pipeline ownership described', 'Below the required seniority level'],
      recommendations: ['Not a strong fit for this senior role as currently written.'],
      evidence: ['Generalist background across small startups: Node.js services, some Python scripting, and basic AWS deployment'],
    },
  },
]

function nextWorkingWeekdayOffset(baseDaysFromNow: number, hour: number): Date {
  let day = DateTime.fromJSDate(new Date(), { zone: TIMEZONE }).plus({ days: Math.max(1, baseDaysFromNow) }).startOf('day')
  while (day.weekday < 1 || day.weekday > 5) day = day.plus({ days: 1 })
  return day.plus({ hours: hour }).toJSDate()
}

function pastWorkingWeekdayOffset(daysAgo: number, hour: number): Date {
  const day = DateTime.fromJSDate(new Date(), { zone: TIMEZONE }).minus({ days: Math.abs(daysAgo) }).startOf('day')
  return day.plus({ hours: hour }).toJSDate()
}

async function seed(): Promise<void> {
  console.log('Seeding development data...')
  await ensureScheduleConfig()

  const recruiterIdByKey = new Map<string, string>()
  const recruiterNameByKey = new Map<string, string>()
  const companyIdByKey = new Map<string, string>()
  const companyNameByKey = new Map<string, string>()

  for (const recruiter of RECRUITERS) {
    const email = seedEmail(`recruiter.${recruiter.key}`)
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10)
    const user = await UserModel.create({
      name: recruiter.name,
      email,
      passwordHash,
      timezone: TIMEZONE,
      accountType: 'recruiter',
    })
    const company = await CompanyModel.create({
      recruiterId: user._id,
      name: recruiter.companyName,
      industry: recruiter.industry,
      size: recruiter.size,
      location: recruiter.location,
      description: recruiter.description,
      website: `https://${recruiter.key}.example.com`,
    })
    user.companyId = company._id
    await user.save()
    await ensureRecruiterScheduleConfig(user._id.toString())
    recruiterIdByKey.set(recruiter.key, user._id.toString())
    recruiterNameByKey.set(recruiter.key, recruiter.name)
    companyIdByKey.set(recruiter.key, company._id.toString())
    companyNameByKey.set(recruiter.key, recruiter.companyName)
    console.log(`  Recruiter: ${email} (${SEED_PASSWORD}) — ${recruiter.companyName}`)
  }

  const jobIdByTitle = new Map<string, string>()
  const recruiterNameByJobTitle = new Map<string, string>()
  const recruiterIdByJobTitle = new Map<string, string>()
  for (const job of JOBS) {
    const recruiterId = recruiterIdByKey.get(job.recruiterKey)!
    recruiterNameByJobTitle.set(job.title, recruiterNameByKey.get(job.recruiterKey)!)
    recruiterIdByJobTitle.set(job.title, recruiterId)
    const created = await JobModel.create({
      companyId: companyIdByKey.get(job.recruiterKey)!,
      recruiterId,
      title: job.title,
      slug: `${job.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomBytes(3).toString('hex')}`,
      description: job.description,
      responsibilities: job.responsibilities,
      employmentType: job.employmentType,
      workplaceType: job.workplaceType,
      location: job.location,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: 'USD',
      experienceLevel: job.experienceLevel,
      minExperienceYears: job.minExperienceYears,
      requiredSkills: job.requiredSkills,
      preferredSkills: job.preferredSkills,
      educationRequirement: job.educationRequirement,
      pipeline: job.pipeline.map((stage, index) => ({
        order: index + 1,
        type: stage.type,
        title: stage.title,
        durationMinutes: stage.durationMinutes,
      })),
      status: 'published',
      publishedAt: DateTime.now().minus({ days: job.publishedDaysAgo }).toJSDate(),
    })
    jobIdByTitle.set(job.title, created._id.toString())
    console.log(`  Job: ${job.title} @ ${companyNameByKey.get(job.recruiterKey)}`)
  }

  const candidateIdByKey = new Map<string, string>()
  const candidateEmailByKey = new Map<string, string>()
  const resumeIdByKey = new Map<string, string>()

  for (const candidate of CANDIDATES) {
    const email = seedEmail(`candidate.${candidate.key}`)
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10)
    const user = await UserModel.create({
      name: candidate.name,
      email,
      passwordHash,
      timezone: TIMEZONE,
      accountType: 'candidate',
      headline: candidate.headline,
      location: candidate.location,
      skills: candidate.skills,
      experienceLevel: candidate.experienceLevel,
    })
    candidateIdByKey.set(candidate.key, user._id.toString())
    candidateEmailByKey.set(candidate.key, email)

    const buffer = Buffer.from(candidate.resumeText, 'utf8')
    const storageKey = await saveResumeFile(buffer, 'text/plain')
    const extractedText = await extractResumeText(buffer, 'text/plain')
    const resume = await ResumeModel.create({
      userId: user._id,
      fileName: `${candidate.name.replace(/\s+/g, '_')}_Resume.txt`,
      storageKey,
      mimeType: 'text/plain',
      sizeBytes: buffer.byteLength,
      extractedText,
      isDefault: true,
    })
    resumeIdByKey.set(candidate.key, resume._id.toString())
    console.log(`  Candidate: ${email} (${SEED_PASSWORD}) — ${candidate.headline}`)
  }

  let upcomingSlotOffset = 2

  /** Interprets one application's `steps` in order, each reusing the real
   * application.service.ts / interview.service.ts functions a recruiter/candidate action
   * would call — see the SeedStep doc comment for why 'completePast' is the one exception. */
  async function runSeedSteps(
    app: ApplicationSeed,
    applicationId: string,
    recruiterId: string,
    candidateId: string,
    candidateName: string,
    candidateEmail: string,
  ): Promise<void> {
    const interviewerName = recruiterNameByJobTitle.get(app.jobTitle) ?? ''

    for (const step of app.steps) {
      if (step.action === 'setStatus') {
        await updateApplicationStatus(recruiterId, applicationId, step.status)
        continue
      }

      if (step.action === 'bookUpcoming') {
        const start = nextWorkingWeekdayOffset(upcomingSlotOffset++, 10)
        await scheduleApplicationInterview(candidateId, applicationId, start, TIMEZONE)
        continue
      }

      if (step.action === 'reschedule') {
        const application = await ApplicationModel.findById(applicationId)
        const round = application!.rounds.find((candidate) => candidate.status === 'scheduled')
        if (!round?.interviewId) continue
        const newStart = nextWorkingWeekdayOffset(step.daysFromNow, 11)
        await rescheduleInterview(round.interviewId.toString(), newStart)
        continue
      }

      // 'completePast': the recruiter has already unlocked this round (it's 'ready_to_book')
      // — a historical booking is inserted directly (createInterview() rejects past startAt
      // times by design), then recordRoundOutcome does the real pass/fail status transition.
      const application = await ApplicationModel.findById(applicationId)
      const round = application!.rounds.find((candidate) => candidate.status === 'ready_to_book')
      if (!round) continue
      const jobDoc = await JobModel.findById(application!.jobId)
      const start = pastWorkingWeekdayOffset(step.daysAgo, 14)
      const end = new Date(start.getTime() + round.durationMinutes * 60_000)
      const { hash: manageTokenHash } = generateManageToken()
      const interview = await InterviewModel.create({
        title: `${jobDoc!.title} — ${round.title}`,
        interviewType: round.type,
        round: round.order,
        locationType: 'video',
        meetingUrl: 'https://meet.example.com/seed-demo',
        interviewerName,
        candidateName,
        candidateEmail,
        startAt: start,
        endAt: end,
        durationMinutes: round.durationMinutes,
        timezone: TIMEZONE,
        status: 'confirmed',
        source: 'admin',
        manageTokenHash,
        userId: candidateId,
        jobId: jobDoc!._id,
        applicationId: application!._id,
      })
      round.status = 'scheduled'
      round.interviewId = interview._id
      await application!.save()
      await recordRoundOutcome(recruiterId, applicationId, round.order, step.outcome)
    }
  }

  for (const app of APPLICATIONS) {
    const jobId = jobIdByTitle.get(app.jobTitle)
    const recruiterId = recruiterIdByJobTitle.get(app.jobTitle)
    const candidateId = candidateIdByKey.get(app.candidateKey)
    const candidateEmail = candidateEmailByKey.get(app.candidateKey)
    const resumeId = resumeIdByKey.get(app.candidateKey)
    const candidateName = CANDIDATES.find((c) => c.key === app.candidateKey)!.name
    if (!jobId || !recruiterId || !candidateId || !resumeId || !candidateEmail) continue

    const job = await JobModel.findById(jobId)
    const rounds = job!.pipeline
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((stage) => ({
        order: stage.order,
        type: stage.type,
        title: stage.title,
        durationMinutes: stage.durationMinutes,
        instructions: stage.instructions,
        status: 'locked' as const,
      }))

    const application = await ApplicationModel.create({
      jobId,
      candidateId,
      resumeId,
      status: 'applied',
      atsAnalysis: { ...app.ats, analyzedAt: new Date() },
      rounds,
    })

    await runSeedSteps(app, application._id.toString(), recruiterId, candidateId, candidateName, candidateEmail)
  }
  console.log(`  Created ${APPLICATIONS.length} applications across ${JOBS.length} jobs.`)

  console.log('\nDone. Sign in with any seeded account above (all use the same password).')
  console.log('Remove all seed data at any time with: npm run seed:dev:remove')
}

async function main() {
  const shouldRemove = process.argv.includes('--remove')
  await connectDb()
  try {
    if (shouldRemove) {
      await removeSeedData()
    } else {
      await removeSeedData() // idempotent: clear any previous run first
      await seed()
    }
  } finally {
    await disconnectDb()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

import { Link } from 'react-router-dom'
import { ReactLenis } from 'lenis/react'
import { motion } from 'motion/react'
import {
  ArrowRight,
  Brain,
  Briefcase,
  Building2,
  Calendar,
  FileSearch,
  Search,
  Send,
  Sparkles,
  Target,
  Users,
} from 'lucide-react'
import { useUserSession } from '@/features/auth/hooks/useUserSession'
import { ThemeToggle } from '@/features/theme/ThemeToggle'
import { Button } from '@/components/ui/Button'
import { MatchScoreGauge } from '@/components/ui/MatchScoreGauge'
import { SkillChip } from '@/components/ui/SkillChip'

const NAV_LINKS = [
  { href: '#workflow', label: 'How it works' },
  { href: '#ai-match', label: 'AI matching' },
  { href: '#for-recruiters', label: 'For recruiters' },
]

const CANDIDATE_STEPS = [
  { Icon: Search, label: 'Discover' },
  { Icon: Send, label: 'Apply' },
  { Icon: Brain, label: 'AI Match' },
  { Icon: Calendar, label: 'Interview' },
]

const RECRUITER_STEPS = [
  { Icon: Briefcase, label: 'Post' },
  { Icon: FileSearch, label: 'Analyze' },
  { Icon: Target, label: 'Shortlist' },
  { Icon: Calendar, label: 'Schedule' },
]

const FEATURES = [
  { Icon: Brain, title: 'AI resume & job-fit analysis', body: 'An explainable, evidence-backed score for every application — never a black-box verdict.' },
  { Icon: Target, title: 'Application pipeline', body: 'Applied, shortlisted, interviewing, selected — track every candidate at a glance.' },
  { Icon: Calendar, title: 'Conflict-safe scheduling', body: 'Working hours, breaks, buffers, and blocked time are enforced by one authoritative engine.' },
  { Icon: Sparkles, title: 'Integrated AI assistant', body: 'Ask in plain language to find jobs, review applications, or manage an interview.' },
]

const SEED_COMPANIES = ['TechNova Labs', 'PixelForge', 'CloudScale', 'BrightLayer AI']

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
}

function StepPath({ steps }: { steps: Array<{ Icon: typeof Search; label: string }> }) {
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((step, index) => (
        <div key={step.label} className="flex items-center gap-1.5">
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-paper-50 text-ink-700">
              <step.Icon size={16} aria-hidden="true" />
            </div>
            <span className="text-xs font-medium text-ink-700">{step.label}</span>
          </div>
          {index < steps.length - 1 && <ArrowRight size={14} aria-hidden="true" className="mb-5 shrink-0 text-ink-300" />}
        </div>
      ))}
    </div>
  )
}

export function LandingPage() {
  const session = useUserSession()
  const isSignedIn = Boolean(session.data)

  return (
    <ReactLenis root options={{ lerp: 0.12, duration: 1.1 }}>
      <div className="min-h-dvh bg-paper-100">
        <header className="sticky top-0 z-10 border-b border-hairline bg-paper-50/95 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <span className="font-mono text-sm font-medium tracking-wide text-ink-900">The Ledger</span>
            <nav className="hidden items-center gap-6 text-sm text-ink-700 md:flex">
              {NAV_LINKS.map((link) => (
                <a key={link.href} href={link.href} className="hover:text-ink-900">
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              {isSignedIn ? (
                <Link to="/dashboard">
                  <Button variant="primary">Go to dashboard</Button>
                </Link>
              ) : (
                <>
                  <Link to="/login" className="hidden min-h-11 items-center px-2 text-sm font-medium text-ink-700 hover:text-ink-900 sm:flex">
                    Log in
                  </Link>
                  <Link to="/register">
                    <Button variant="primary">Get started</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="mx-auto max-w-3xl text-center"
          >
            <span className="inline-flex items-center gap-1.5 rounded-pill border border-amber-600/40 bg-amber-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-amber-600">
              <Sparkles size={12} aria-hidden="true" /> AI-powered recruitment
            </span>
            <h1 className="mt-5 text-xl font-medium text-ink-900 sm:text-2xl">
              Hiring, from job discovery to interview scheduling.
            </h1>
            <p className="mt-4 text-base text-ink-700 sm:text-md">
              Recruiters post jobs and get explainable AI job-fit analysis on every application. Candidates
              apply once and see exactly how they match — then schedule the interview themselves, on a
              conflict-safe calendar.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to={isSignedIn ? '/dashboard' : '/register'}>
                <Button variant="primary" size="md">
                  {isSignedIn ? 'Go to dashboard' : 'Get started'}
                </Button>
              </Link>
              <Link to="/jobs">
                <Button variant="secondary" size="md">
                  Browse jobs
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* Dual path cards */}
          <div id="workflow" className="mx-auto mt-14 grid max-w-4xl gap-4 sm:grid-cols-2">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.4 }}
              variants={fadeUp}
              transition={{ duration: 0.4 }}
              className="rounded-lg border border-hairline bg-paper-50 p-5 shadow-tag"
            >
              <div className="flex items-center gap-2">
                <Users size={16} aria-hidden="true" className="text-amber-600" />
                <h2 className="text-sm font-medium text-ink-900">For candidates</h2>
              </div>
              <p className="mt-2 text-sm text-ink-700">Discover jobs, apply with your resume, and see your AI match.</p>
              <div className="mt-5 overflow-x-auto">
                <StepPath steps={CANDIDATE_STEPS} />
              </div>
            </motion.div>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.4 }}
              variants={fadeUp}
              transition={{ duration: 0.4, delay: 0.08 }}
              className="rounded-lg border border-hairline bg-paper-50 p-5 shadow-tag"
            >
              <div className="flex items-center gap-2">
                <Building2 size={16} aria-hidden="true" className="text-amber-600" />
                <h2 className="text-sm font-medium text-ink-900">For recruiters</h2>
              </div>
              <p className="mt-2 text-sm text-ink-700">Post a job, review AI-analyzed applications, and schedule interviews.</p>
              <div className="mt-5 overflow-x-auto">
                <StepPath steps={RECRUITER_STEPS} />
              </div>
            </motion.div>
          </div>
        </section>

        {/* AI matching showcase */}
        <section id="ai-match" className="border-t border-hairline bg-paper-50 py-16 sm:py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={fadeUp} transition={{ duration: 0.4 }}>
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-amber-600/40 bg-amber-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-amber-600">
                <Brain size={12} aria-hidden="true" /> AI job-fit analysis
              </span>
              <h2 className="mt-4 text-lg font-medium text-ink-900 sm:text-xl">Not just a score — an explanation.</h2>
              <p className="mt-3 max-w-2xl text-sm text-ink-700">
                Every application gets matched skills, gaps, and a plain-language recommendation, backed by
                evidence pulled directly from the resume — never a bare percentage with no context.
              </p>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={fadeUp}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="mt-8 grid gap-6 rounded-lg border border-hairline bg-paper-100 p-6 sm:grid-cols-[auto_1fr] sm:p-8"
            >
              <MatchScoreGauge score={96} size="lg" />
              <div>
                <p className="text-sm font-medium text-ink-900">Exceptional match — Senior Frontend Engineer</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <SkillChip label="React" tone="matched" />
                  <SkillChip label="TypeScript" tone="matched" />
                  <SkillChip label="Accessibility" tone="matched" />
                  <SkillChip label="Next.js" tone="neutral" />
                </div>
                <p className="mt-3 text-sm text-ink-700">
                  "Led company-wide design system adoption across 40+ engineers. Deep, hands-on accessibility
                  expertise — a required skill, rarely this strong."
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Features */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-lg font-medium text-ink-900 sm:text-xl">Everything hiring needs, nothing it doesn't</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.4 }}
                  variants={fadeUp}
                  transition={{ duration: 0.35, delay: index * 0.05 }}
                  className="rounded-lg border border-hairline bg-paper-50 p-4 shadow-tag"
                >
                  <feature.Icon size={18} aria-hidden="true" className="text-amber-600" />
                  <h3 className="mt-3 text-sm font-medium text-ink-900">{feature.title}</h3>
                  <p className="mt-1.5 text-sm text-ink-700">{feature.body}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* For recruiters / for candidates */}
        <section id="for-recruiters" className="border-t border-hairline bg-paper-50 py-16 sm:py-20">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 md:grid-cols-2 md:gap-12">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={fadeUp} transition={{ duration: 0.4 }}>
              <h2 className="text-lg font-medium text-ink-900 sm:text-xl">For recruiters</h2>
              <p className="mt-3 text-sm text-ink-700">
                Post a job in minutes. Every application arrives pre-analyzed against your requirements, so
                you can review a candidate's fit before you ever open their resume — then move them through
                a clear pipeline, from applied to selected.
              </p>
              <ul className="mt-4 flex flex-col gap-2 text-sm text-ink-700">
                <li className="flex items-start gap-2">
                  <Target size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-600" />
                  AI job-fit scoring with matched skills, gaps, and evidence — never a bare number
                </li>
                <li className="flex items-start gap-2">
                  <FileSearch size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-600" />
                  A visual application pipeline for every job you post
                </li>
                <li className="flex items-start gap-2">
                  <Calendar size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-600" />
                  Invite to interview and let the candidate pick a real, conflict-free time
                </li>
              </ul>
            </motion.div>
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }} variants={fadeUp} transition={{ duration: 0.4, delay: 0.08 }}>
              <h2 className="text-lg font-medium text-ink-900 sm:text-xl">For candidates</h2>
              <p className="mt-3 text-sm text-ink-700">
                Browse jobs freely — no account required. Create one to save your resume, apply in a few
                clicks, and see exactly how your application is progressing, including your own AI-estimated
                job fit.
              </p>
              <ul className="mt-4 flex flex-col gap-2 text-sm text-ink-700">
                <li className="flex items-start gap-2">
                  <FileSearch size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-600" />
                  Keep multiple resumes on file and pick one per application
                </li>
                <li className="flex items-start gap-2">
                  <Brain size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-600" />
                  See your AI job-fit analysis — strengths, gaps, and suggestions, explained
                </li>
                <li className="flex items-start gap-2">
                  <Calendar size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-600" />
                  Schedule your interview yourself once invited, at a real available time
                </li>
              </ul>
            </motion.div>
          </div>
        </section>

        {/* Social proof — demo data, clearly marked */}
        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Demo companies used to preview this product</p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              {SEED_COMPANIES.map((name) => (
                <span key={name} className="font-mono text-sm text-ink-700">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-hairline bg-paper-50 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-lg font-medium text-ink-900 sm:text-xl">Ready to hire, or get hired?</h2>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link to={isSignedIn ? '/dashboard' : '/register'}>
                <Button variant="primary" size="md">
                  {isSignedIn ? 'Go to dashboard' : 'Get started'}
                </Button>
              </Link>
              <Link to="/jobs">
                <Button variant="secondary" size="md">
                  Browse jobs
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <footer className="border-t border-hairline px-4 py-8 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 text-center text-sm text-ink-500 sm:flex-row sm:justify-between sm:text-left">
            <span className="font-mono text-ink-700">The Ledger</span>
            <span>AI-powered recruitment &amp; interview scheduling, done right.</span>
            <Link to="/jobs" className="hover:text-ink-700">
              Browse open roles
            </Link>
          </div>
        </footer>
      </div>
    </ReactLenis>
  )
}

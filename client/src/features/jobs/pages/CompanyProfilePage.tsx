import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, Building2, ExternalLink, Globe, MapPin, Users } from 'lucide-react'
import { PublicJobsShell } from '@/components/layout/PublicJobsShell'
import { fetchCompanyProfile } from '@/features/jobs/api/companiesApi'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { SkillChip } from '@/components/ui/SkillChip'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'

export function CompanyProfilePage() {
  const { id = '' } = useParams<{ id: string }>()
  const query = useQuery({ queryKey: ['company-profile', id], queryFn: () => fetchCompanyProfile(id), enabled: Boolean(id) })

  if (query.isLoading) {
    return (
      <PublicJobsShell>
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 sm:px-6">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      </PublicJobsShell>
    )
  }

  const company = query.data?.company
  if (!company) {
    return (
      <PublicJobsShell>
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <EmptyState icon={Building2} title="This company couldn't be found." description="The profile may no longer be available." />
        </div>
      </PublicJobsShell>
    )
  }

  const jobs = query.data?.jobs ?? []

  return (
    <PublicJobsShell>
      <div className="mx-auto max-w-3xl px-4 py-8 pb-16 sm:px-6">
        <div className="flex items-start gap-4">
          <Avatar name={company.name} size="lg" photoUrl={company.logoUrl} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-medium text-ink-900">{company.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-700">
              {company.industry && <span>{company.industry}</span>}
              {company.size && <span>{company.size} employees</span>}
              {company.foundedYear && <span>Founded {company.foundedYear}</span>}
              {company.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={13} aria-hidden="true" />
                  {company.location}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {company.website && (
                <a
                  href={company.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-pill border border-hairline px-3 text-xs font-medium text-ink-700 hover:text-ink-900"
                >
                  <Globe size={13} aria-hidden="true" />
                  Website
                </a>
              )}
              {company.linkedIn && (
                <a
                  href={company.linkedIn}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-pill border border-hairline px-3 text-xs font-medium text-ink-700 hover:text-ink-900"
                >
                  <ExternalLink size={13} aria-hidden="true" />
                  LinkedIn
                </a>
              )}
            </div>
          </div>
        </div>

        {company.description && (
          <section className="mt-6">
            <h2 className="text-md font-medium text-ink-900">About</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-ink-700">{company.description}</p>
          </section>
        )}

        {company.culture && (
          <section className="mt-6">
            <h2 className="text-md font-medium text-ink-900">Culture</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-ink-700">{company.culture}</p>
          </section>
        )}

        {company.benefits.length > 0 && (
          <section className="mt-6">
            <h2 className="text-md font-medium text-ink-900">Benefits</h2>
            <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-700">
              {company.benefits.map((benefit, index) => (
                <li key={index}>· {benefit}</li>
              ))}
            </ul>
          </section>
        )}

        {company.techStack.length > 0 && (
          <section className="mt-6">
            <h2 className="text-md font-medium text-ink-900">Tech stack</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {company.techStack.map((tech) => (
                <SkillChip key={tech} label={tech} tone="neutral" />
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="flex items-center gap-1.5 text-md font-medium text-ink-900">
            <Briefcase size={16} aria-hidden="true" className="text-amber-600" />
            Open jobs ({jobs.length})
          </h2>
          {jobs.length === 0 ? (
            <p className="mt-2 text-sm text-ink-700">No open jobs right now — check back soon.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-2.5">
              {jobs.map((job) => (
                <Link
                  key={job.id}
                  to={`/jobs/${job.slug}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-paper-50 p-4 shadow-tag transition-colors hover:border-amber-600/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">{job.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-700">
                      <span className="capitalize">{job.experienceLevel}</span>
                      {job.location && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{job.location}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <Badge tone="neutral" className="shrink-0">
                    <Users size={11} aria-hidden="true" />
                    {job.applicantCount}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </PublicJobsShell>
  )
}

import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';
import SharedFooter from '@/components/site/SiteFooter';
import { breadcrumbLd, jsonLd } from '../_lib/guide';

// The county pages' frame: the public pages' own top bar, the footer every company page draws (with these pages' own
// closing line), and the breadcrumb with its structured data. Server-rendered, no script of its own.

export function SiteNav() {
  return (
    <nav className="sticky top-0 z-50 bg-app-surface/90 backdrop-blur-md border-b border-app-border-subtle">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center gap-2.5">
            <LayoutDashboard className="w-7 h-7 text-primary-600" />
            <div className="flex flex-col leading-none">
              <span className="text-xl font-bold tracking-tight text-primary-700 dark:text-primary-400">Pantopus</span>
              <span className="hidden sm:block text-[10px] font-medium text-app-text-muted dark:text-app-text-secondary tracking-wide uppercase">Real life, connected</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-app-text-strong hover:text-primary-700 dark:hover:text-primary-300 px-3 py-2 transition">
              Log in
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

export function SiteFooter() {
  return <SharedFooter note="Pantopus is not a government office. Each office and source on these pages is named where its facts appear." />;
}

export function Breadcrumb({ items }: { items: { name: string; path: string }[] }) {
  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-app-text-secondary dark:text-app-text-muted">
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {items.map((item, i) => (
            <li key={item.path} className="flex items-center gap-1.5">
              {i > 0 ? <span aria-hidden="true" className="text-app-text-muted">›</span> : null}
              {i === items.length - 1 ? (
                <span aria-current="page" className="text-app-text dark:text-white font-medium">{item.name}</span>
              ) : (
                <Link href={item.path} className="hover:text-primary-700 dark:hover:text-primary-300 underline-offset-2 hover:underline">
                  {item.name}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbLd(items)) }} />
    </>
  );
}

export const linkClass = 'text-primary-700 dark:text-primary-300 underline underline-offset-2 hover:decoration-2 break-words';

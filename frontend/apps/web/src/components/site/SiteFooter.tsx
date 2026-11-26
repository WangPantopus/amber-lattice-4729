import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';
import { MAIN_FOOTER_COLUMNS } from '@/lib/site/footerLinks';

// The footer of the company, policy, property-record and address-lookup pages: the site's main sections from the one
// list every public footer reads (src/lib/site/footerLinks.ts), so each section is linked from every public page under
// the same words. Server-rendered, no script of its own. `note` is a page's own closing line (the property-record
// pages say they are not a government office).
export default function SiteFooter({ note }: { note?: string }) {
  return (
    <footer className="bg-gray-900 text-slate-400 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-8 mb-12">
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <div className="flex items-center gap-2.5 mb-3">
              <LayoutDashboard className="w-5 h-5 text-primary-600" />
              <span className="text-lg font-bold text-white">Pantopus</span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed max-w-xs">
              Real life, connected. Every account starts at a real home.
            </p>
          </div>
          {MAIN_FOOTER_COLUMNS.map((column) => (
            <nav key={column.head} aria-label={column.head}>
              <h3 className="text-white font-semibold mb-4 text-sm">{column.head}</h3>
              <ul className="space-y-2.5 text-sm">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="hover:text-white transition">{link.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="border-t border-gray-800 pt-8 text-center text-sm text-slate-400">
          {note ? <p className="mb-3">{note}</p> : null}
          <p>© 2026 Pantopus. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

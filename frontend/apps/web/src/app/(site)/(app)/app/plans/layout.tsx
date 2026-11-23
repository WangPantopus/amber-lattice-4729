import type { ReactNode } from 'react';
import PlansWorkspace from '@/components/plans/PlansWorkspace';

export default function Layout({ children }: { children: ReactNode }) {
  return <PlansWorkspace>{children}</PlansWorkspace>;
}

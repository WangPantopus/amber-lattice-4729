// The four topic pages, in the order the footer and /guides list them.

import type { TopicPage } from './types';
import { socialNetwork } from './social-network';
import { homeBuying } from './home-buying';
import { homeManagement } from './home-management';
import { homeSafety } from './home-safety';

export type { TopicPage, TopicSection } from './types';

export const TOPICS: TopicPage[] = [socialNetwork, homeBuying, homeManagement, homeSafety];

import { socialNetwork } from '@/lib/site/topics/social-network';
import TopicArticle, { topicMetadata } from '../_reading/TopicArticle';

export const metadata = topicMetadata(socialNetwork);

export default function Page() {
  return <TopicArticle t={socialNetwork} />;
}

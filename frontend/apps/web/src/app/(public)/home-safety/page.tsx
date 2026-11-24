import { homeSafety } from '@/lib/site/topics/home-safety';
import TopicArticle, { topicMetadata } from '../_reading/TopicArticle';

export const metadata = topicMetadata(homeSafety);

export default function Page() {
  return <TopicArticle t={homeSafety} />;
}

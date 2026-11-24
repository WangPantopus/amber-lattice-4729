import { homeBuying } from '@/lib/site/topics/home-buying';
import TopicArticle, { topicMetadata } from '../_reading/TopicArticle';

export const metadata = topicMetadata(homeBuying);

export default function Page() {
  return <TopicArticle t={homeBuying} />;
}
